import { useEffect, useRef } from 'react';
import { AppState, TouchableOpacity, View, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { receiveIncoming, checkForRingingCall } from '@/lib/calls/callManager';
import { useCall } from '@/lib/calls/useCall';
import { callsSupported } from '@/lib/calls/webrtc';

// Lives once at the top of the app. Listens for people calling you (instantly while the app is
// open, and when you open the app from a ringing notification) and opens the call screen. When a
// call is going on and you are on another screen, shows a green "Return to call" bar.
export default function CallHost() {
  const { session } = useAuth();
  const uid = session?.user?.id;
  const call = useCall();
  const pathname = usePathname();
  const lastShown = useRef<string | null>(null);

  // Open the call screen whenever a call starts ringing for me.
  useEffect(() => {
    if (call.phase === 'ringing_in' && call.callId && lastShown.current !== call.callId) {
      lastShown.current = call.callId;
      router.push('/call' as any);
    }
  }, [call.phase, call.callId]);

  useEffect(() => {
    if (!uid || !callsSupported()) return;
    const ch = supabase
      .channel(`incoming-calls-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${uid}` }, async (p: any) => {
        const row = p.new;
        if (!row || row.status !== 'ringing') return;
        const { data: prof } = await supabase.from('profiles').select('display_name,username,avatar_url').eq('id', row.caller_id).maybeSingle();
        receiveIncoming({ callId: row.id, callerId: row.caller_id, name: prof?.display_name || prof?.username || 'Someone', avatar: prof?.avatar_url || null, conversationId: row.conversation_id });
      })
      .subscribe();
    checkForRingingCall();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') checkForRingingCall(); });
    return () => { supabase.removeChannel(ch); sub.remove(); };
  }, [uid]);

  const active = call.phase === 'calling' || call.phase === 'connecting' || call.phase === 'connected';
  if (!active || pathname === '/call') return null;
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => router.push('/call' as any)} style={styles.bar}>
      <Ionicons name="call" size={16} color="#fff" />
      <Text style={styles.text} numberOfLines={1}>
        {call.phase === 'connected' ? 'Return to call' : call.phase === 'calling' && call.ringing ? 'Ringing' : 'Calling'} · {call.peerName}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 34, paddingBottom: 8, paddingHorizontal: 16, backgroundColor: '#16A34A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, zIndex: 999 },
  text: { color: '#fff', fontWeight: '700' },
});
