import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, BackHandler } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Avatar from '@/components/Avatar';
import { useCall } from '@/lib/calls/useCall';
import { acceptIncoming, declineIncoming, hangup, toggleMute, toggleSpeaker } from '@/lib/calls/callManager';

// The voice call screen. Always dark, like a phone call. Shows ringing / calling / connected and the buttons.
function timer(startedAt: number | null) {
  if (!startedAt) return '';
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function CallScreen() {
  const call = useCall();
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Nothing to show once the call is over.
  useEffect(() => {
    if (call.phase === 'idle') router.back();
  }, [call.phase]);

  // The back button leaves the screen but keeps the call going (the green bar brings you back).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (call.phase === 'ringing_in') return true;
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [call.phase]);

  const status =
    call.phase === 'ringing_in' ? 'Incoming voice call'
    : call.phase === 'calling' ? (call.ringing ? 'Ringing…' : 'Calling…')
    : call.phase === 'connecting' ? 'Connecting…'
    : call.phase === 'connected' ? (call.reconnecting ? 'Reconnecting…' : timer(call.startedAt))
    : call.message || 'Call ended';

  const Round = ({ icon, color = 'rgba(255,255,255,0.16)', onPress, label, active }: { icon: any; color?: string; onPress: () => void; label?: string; active?: boolean }) => (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.round, { backgroundColor: active ? '#fff' : color }]}>
        <Ionicons name={icon} size={28} color={active ? '#111' : '#fff'} />
      </TouchableOpacity>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );

  return (
    <LinearGradient colors={['#0B1220', '#111B33', '#05060A']} style={styles.container}>
      <View style={styles.top}>
        <Avatar uri={call.peerAvatar} size={132} />
        <Text style={styles.name} numberOfLines={1}>{call.peerName || ' '}</Text>
        <Text style={styles.status}>{status}</Text>
      </View>

      <View style={styles.bottom}>
        {call.phase === 'ringing_in' ? (
          <View style={styles.row}>
            <Round icon="call" color="#EF4444" onPress={declineIncoming} label="Decline" />
            <Round icon="call" color="#16A34A" onPress={acceptIncoming} label="Accept" />
          </View>
        ) : call.phase === 'ended' ? null : (
          <View style={styles.row}>
            <Round icon={call.muted ? 'mic-off' : 'mic'} active={call.muted} onPress={toggleMute} label={call.muted ? 'Unmute' : 'Mute'} />
            <Round icon="call" color="#EF4444" onPress={() => hangup('hangup')} label="End" />
            <Round icon="volume-high" active={call.speaker} onPress={toggleSpeaker} label="Speaker" />
          </View>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', paddingTop: 110, paddingBottom: 70 },
  top: { alignItems: 'center', gap: 14, paddingHorizontal: 24 },
  name: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 10 },
  status: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '600' },
  bottom: { alignItems: 'center' },
  row: { flexDirection: 'row', gap: 38, alignItems: 'flex-start' },
  round: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  label: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
});
