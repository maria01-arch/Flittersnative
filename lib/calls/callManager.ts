import { PermissionsAndroid, Platform, Vibration } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { supabase } from '../supabase';
import { callsSupported, getWebRTC } from './webrtc';
import { fetchIceServers } from './ice';
import { callAudioSpeaker, callAudioStart, callAudioStop } from '@/modules/flitters-call';

// One voice call at a time. This file owns everything about it: the phone line (WebRTC), the
// setup messages passed through Supabase (call_signals), ringing, mute, speaker and ending.
// Screens only read the state and press the few buttons below.

export type CallPhase = 'idle' | 'calling' | 'ringing_in' | 'connecting' | 'connected' | 'ended';
export type CallState = {
  phase: CallPhase;
  callId: string | null;
  role: 'caller' | 'callee' | null;
  peerId: string | null;
  peerName: string;
  peerAvatar: string | null;
  conversationId: string | null;
  muted: boolean;
  speaker: boolean;
  startedAt: number | null;   // when the audio connected (for the timer)
  reconnecting: boolean;
  message: string | null;     // why it ended, in plain words
};

const IDLE: CallState = { phase: 'idle', callId: null, role: null, peerId: null, peerName: '', peerAvatar: null, conversationId: null, muted: false, speaker: false, startedAt: null, reconnecting: false, message: null };

let state: CallState = IDLE;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<CallState>) => { state = { ...state, ...patch }; emit(); };
export const getCallState = () => state;
// Fired once whenever a call finishes, so an open chat can pull the new call card at once.
const endListeners = new Set<() => void>();
export function onCallFinished(fn: () => void) { endListeners.add(fn); return () => { endListeners.delete(fn); }; }

export function subscribeCall(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

const RING_SECONDS = 45;
const ERRORS: Record<string, string> = {
  callee_busy: 'is on another call.',
  already_in_call: 'You are already in a call.',
  not_allowed: "This person doesn't take calls from you.",
  cannot_call: "You can't call this person.",
  too_many_calls: 'Too many calls. Try again in a few minutes.',
  call_gone: 'The call has ended.',
  not_signed_in: 'Please sign in again.',
};
function friendly(message: string | undefined, name: string): string {
  const m = message || '';
  for (const k of Object.keys(ERRORS)) if (m.includes(k)) return k === 'callee_busy' ? `${name} ${ERRORS[k]}` : ERRORS[k];
  if (/function .* does not exist|schema cache/i.test(m)) return 'Calls are not switched on yet.';
  return "Couldn't start the call. Check your connection and try again.";
}

// A Supabase call is only SENT when it is awaited (or .then() is called). This runs one in the
// background without waiting. (Calling supabase.rpc(...) and ignoring it sends nothing.)
function fire(q: PromiseLike<unknown>) {
  Promise.resolve(q).then(() => {}, () => {});
}

// ---- everything below belongs to the call in progress and is thrown away when it ends ----
let pc: any = null;
let localStream: any = null;
let channels: any[] = [];
let timers: ReturnType<typeof setInterval>[] = [];
let timeouts: ReturnType<typeof setTimeout>[] = [];
let ringPlayer: any = null;
let me: string | null = null;
let lastSignalId = 0;
const seenSignals = new Set<number>();
let pendingIce: any[] = [];
let remoteSet = false;
let gotOffer = false;
let ending = false;

function playRing(kind: 'ringtone' | 'ringback') {
  stopRing();
  try {
    ringPlayer = createAudioPlayer(kind === 'ringtone' ? require('@/assets/sounds/ringtone.wav') : require('@/assets/sounds/ringback.wav'));
    ringPlayer.loop = true;
    ringPlayer.play();
  } catch {}
  if (kind === 'ringtone') { try { Vibration.vibrate([0, 700, 900], true); } catch {} }
}
function stopRing() {
  try { ringPlayer?.pause?.(); ringPlayer?.remove?.(); } catch {}
  ringPlayer = null;
  try { Vibration.cancel(); } catch {}
}

async function ensureMic(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Microphone',
    message: 'Flitters needs the microphone so the other person can hear you.',
    buttonPositive: 'Allow',
  });
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

async function signal(kind: 'offer' | 'answer' | 'ice', payload: any) {
  if (!state.callId) return;
  const { error } = await supabase.rpc('send_signal', { p_call: state.callId, p_kind: kind, p_payload: payload });
  if (error && !/call_gone/.test(error.message)) console.warn('[call] send_signal failed:', error.message);
}

async function handleSignal(row: any) {
  if (!pc || seenSignals.has(row.id)) return;
  seenSignals.add(row.id);
  lastSignalId = Math.max(lastSignalId, row.id);
  const { RTCSessionDescription, RTCIceCandidate } = getWebRTC();
  try {
    if (row.kind === 'offer' && state.role === 'callee' && !gotOffer) {
      gotOffer = true;
      await pc.setRemoteDescription(new RTCSessionDescription(row.payload));
      remoteSet = true;
      await flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await signal('answer', { type: answer.type, sdp: answer.sdp });
    } else if (row.kind === 'answer' && state.role === 'caller' && !remoteSet) {
      await pc.setRemoteDescription(new RTCSessionDescription(row.payload));
      remoteSet = true;
      await flushIce();
    } else if (row.kind === 'ice') {
      if (remoteSet) await pc.addIceCandidate(new RTCIceCandidate(row.payload)).catch(() => {});
      else pendingIce.push(row.payload);
    }
  } catch (err) {
    console.warn('[call] handling a setup message failed:', err);
  }
}
async function flushIce() {
  const { RTCIceCandidate } = getWebRTC();
  const list = pendingIce; pendingIce = [];
  for (const c of list) await pc?.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
}

async function pullSignals() {
  if (!state.callId || !me) return;
  const { data } = await supabase.from('call_signals').select('id,kind,payload').eq('call_id', state.callId).eq('to_id', me).gt('id', lastSignalId).order('id');
  for (const r of data || []) await handleSignal(r);
}

// Builds the phone line: microphone in, the other person's voice out, and the network handshake.
async function buildConnection(): Promise<boolean> {
  const W = getWebRTC();
  if (!(await ensureMic())) { await finish('Microphone access is needed for calls.', true); return false; }
  const iceServers = await fetchIceServers();
  pc = new W.RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
  localStream = await W.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  localStream.getTracks().forEach((t: any) => pc.addTrack(t, localStream));

  pc.addEventListener('icecandidate', (e: any) => { if (e.candidate) signal('ice', e.candidate.toJSON ? e.candidate.toJSON() : e.candidate); });
  pc.addEventListener('iceconnectionstatechange', () => {
    const s = pc?.iceConnectionState;
    if (s === 'connected' || s === 'completed') {
      stopRing();
      if (state.phase !== 'connected') set({ phase: 'connected', startedAt: Date.now(), reconnecting: false });
      else set({ reconnecting: false });
    } else if (s === 'disconnected') {
      set({ reconnecting: true });
      timeouts.push(setTimeout(() => { if (pc?.iceConnectionState === 'disconnected' || pc?.iceConnectionState === 'failed') hangup('failed'); }, 12000));
    } else if (s === 'failed') {
      hangup('failed');
    }
  });
  return true;
}

function watchCall(callId: string) {
  // Instant: the other side's setup messages and the call changing state.
  const sig = supabase.channel(`call-sig-${callId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_signals', filter: `to_id=eq.${me}` }, (p: any) => { if (p.new?.call_id === callId) handleSignal(p.new); })
    .subscribe();
  const upd = supabase.channel(`call-state-${callId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` }, (p: any) => onRemoteStatus(p.new?.status))
    .subscribe();
  channels.push(sig, upd);
  // Safety net: if realtime is slow, ask every 1.5 s while connecting and every 5 s afterwards.
  timers.push(setInterval(() => {
    if (state.phase === 'connected') return;
    pullSignals();
  }, 1500));
  timers.push(setInterval(async () => {
    const { data } = await supabase.rpc('call_ping', { p_id: callId });
    if (data && data !== 'accepted' && state.phase !== 'calling' && state.phase !== 'ringing_in') onRemoteStatus(data);
  }, 15000));
}

// Safety net next to realtime: every 3 seconds, ask what the call's state is. Catches a
// "they hung up" or "they answered" that realtime was slow to deliver.
function pollStatus(callId: string) {
  timers.push(setInterval(async () => {
    if (!state.callId || state.callId !== callId || state.phase === 'connected' || state.phase === 'ended' || state.phase === 'idle') return;
    const { data } = await supabase.from('calls').select('status').eq('id', callId).maybeSingle();
    if (data?.status) onRemoteStatus(data.status);
  }, 3000));
}

function onRemoteStatus(status?: string) {
  if (!status || ending) return;
  if (status === 'declined') finish(`${state.peerName || 'They'} declined the call.`);
  else if (status === 'cancelled' || status === 'missed') finish(state.role === 'caller' ? 'No answer.' : 'Missed call.');
  else if (status === 'ended' || status === 'failed') finish('Call ended.');
  else if (status === 'accepted' && state.role === 'caller' && state.phase === 'calling') { stopRing(); set({ phase: 'connecting' }); }
}

async function finish(message: string | null, silent = false) {
  if (ending) return;
  ending = true;
  stopRing();
  timers.forEach(clearInterval); timers = [];
  timeouts.forEach(clearTimeout); timeouts = [];
  channels.forEach((c) => { try { supabase.removeChannel(c); } catch {} }); channels = [];
  try { localStream?.getTracks().forEach((t: any) => t.stop()); } catch {}
  try { pc?.close(); } catch {}
  pc = null; localStream = null; pendingIce = []; remoteSet = false; gotOffer = false; lastSignalId = 0; seenSignals.clear();
  callAudioStop();
  set({ phase: 'ended', message: silent ? message : message });
  endListeners.forEach((l) => { try { l(); } catch {} });
  setTimeout(() => { state = { ...IDLE }; emit(); ending = false; }, 1800);
}

// ---- what the screens call ----

export async function startOutgoing(peer: { id: string; name: string; avatar: string | null }, conversationId: string | null): Promise<{ ok: boolean; message?: string }> {
  if (!callsSupported()) return { ok: false, message: 'Calls need the latest version of Flitters. Please update the app.' };
  if (state.phase !== 'idle') return { ok: false, message: 'You are already in a call.' };
  const { data: sess } = await supabase.auth.getSession();
  me = sess.session?.user?.id ?? null;
  if (!me) return { ok: false, message: 'Please sign in again.' };
  // The microphone must be allowed BEFORE the call service starts (Android refuses it otherwise).
  if (!(await ensureMic())) return { ok: false, message: 'Microphone access is needed for calls. Allow it in your phone settings.' };
  const { data: callId, error } = await supabase.rpc('start_call', { p_callee: peer.id, p_conv: conversationId });
  if (error || !callId) return { ok: false, message: friendly(error?.message, peer.name) };
  ending = false;
  state = { ...IDLE, phase: 'calling', callId, role: 'caller', peerId: peer.id, peerName: peer.name, peerAvatar: peer.avatar, conversationId };
  emit();
  callAudioStart(`Call with ${peer.name}`);
  playRing('ringback');
  try {
    if (!(await buildConnection())) return { ok: true };
    watchCall(callId);
    pollStatus(callId);
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    await signal('offer', { type: offer.type, sdp: offer.sdp });
    timeouts.push(setTimeout(() => { if (state.phase === 'calling') hangup('timeout'); }, RING_SECONDS * 1000));
  } catch (err: any) {
    console.warn('[call] could not start:', err);
    fire(supabase.rpc('end_call', { p_id: callId, p_reason: 'failed' }));
    finish("Couldn't start the call.");
  }
  return { ok: true };
}

// Someone is calling me (from realtime, or because I opened the app from the ringing notification).
export function receiveIncoming(c: { callId: string; callerId: string; name: string; avatar: string | null; conversationId?: string | null }) {
  if (!callsSupported() || state.phase !== 'idle') return;
  ending = false;
  supabase.auth.getSession().then(({ data }) => { me = data.session?.user?.id ?? null; });
  state = { ...IDLE, phase: 'ringing_in', callId: c.callId, role: 'callee', peerId: c.callerId, peerName: c.name, peerAvatar: c.avatar, conversationId: c.conversationId ?? null };
  emit();
  playRing('ringtone');
  timeouts.push(setTimeout(() => { if (state.phase === 'ringing_in') finish('Missed call.'); }, (RING_SECONDS + 10) * 1000));
  // Watch for the caller giving up while it rings.
  const id = c.callId;
  pollStatus(id);
  channels.push(supabase.channel(`call-ring-${id}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${id}` }, (p: any) => { if (state.phase === 'ringing_in') onRemoteStatus(p.new?.status); }).subscribe());
}

export async function acceptIncoming() {
  if (state.phase !== 'ringing_in' || !state.callId) return;
  const callId = state.callId;
  stopRing();
  if (!(await ensureMic())) {
    fire(supabase.rpc('decline_call', { p_id: callId }));
    finish('Microphone access is needed for calls. Allow it in your phone settings.');
    return;
  }
  set({ phase: 'connecting' });
  const { error } = await supabase.rpc('answer_call', { p_id: callId });
  if (error) { finish('The call has ended.'); return; }
  callAudioStart(`Call with ${state.peerName}`);
  try {
    channels.forEach((c) => { try { supabase.removeChannel(c); } catch {} }); channels = [];
    timeouts.forEach(clearTimeout); timeouts = [];
    if (!(await buildConnection())) { fire(supabase.rpc('end_call', { p_id: callId, p_reason: 'failed' })); return; }
    watchCall(callId);
    await pullSignals();   // the caller's offer is already waiting
  } catch (err) {
    console.warn('[call] could not answer:', err);
    fire(supabase.rpc('end_call', { p_id: callId, p_reason: 'failed' }));
    finish("Couldn't connect the call.");
  }
}

export async function declineIncoming() {
  if (state.phase !== 'ringing_in' || !state.callId) return;
  fire(supabase.rpc('decline_call', { p_id: state.callId }));
  finish(null);
}

export async function hangup(reason: 'hangup' | 'timeout' | 'failed' = 'hangup') {
  if (state.phase === 'idle' || state.phase === 'ended' || !state.callId) return;
  const id = state.callId;
  const wasCaller = state.role === 'caller';
  const wasRinging = state.phase === 'calling';
  fire(supabase.rpc('end_call', { p_id: id, p_reason: reason }));
  finish(reason === 'failed' ? 'The connection was lost.' : reason === 'timeout' ? 'No answer.' : wasCaller && wasRinging ? null : 'Call ended.');
}

export function toggleMute() {
  const next = !state.muted;
  try { localStream?.getAudioTracks().forEach((t: any) => { t.enabled = !next; }); } catch {}
  set({ muted: next });
}
export function toggleSpeaker() {
  const next = !state.speaker;
  callAudioSpeaker(next);
  set({ speaker: next });
}

// The app was opened (or came back): is there a call ringing for me that I have not heard about?
export async function checkForRingingCall(): Promise<boolean> {
  if (!callsSupported() || state.phase !== 'idle') return false;
  const { data } = await supabase.rpc('my_active_call');
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || row.status !== 'ringing') return false;
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid || row.callee_id !== uid) return false;
  const { data: p } = await supabase.from('profiles').select('display_name,username,avatar_url').eq('id', row.caller_id).maybeSingle();
  receiveIncoming({ callId: row.id, callerId: row.caller_id, name: p?.display_name || p?.username || 'Someone', avatar: p?.avatar_url || null, conversationId: row.conversation_id });
  return true;
}

