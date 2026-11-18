import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { postTime } from '@/lib/timeAgo';

// The card in a chat for a voice call: "Voice call 2:13", "Missed voice call", "No answer", "Declined".
// Written by the server when the call ends (the message text is the plain fallback). Tap to call back.
export default function CallCard({ message, isMine, onCallBack }: { message: any; isMine: boolean; onCallBack: () => void }) {
  const { colors } = useTheme();
  const text: string = message.content || '';
  const answered = text.startsWith('Voice call');
  const declined = text.startsWith('Declined');
  const duration = answered ? text.split('·')[1]?.trim() : '';

  const title = answered ? 'Voice call' : declined ? (isMine ? 'Call declined' : 'Declined voice call') : isMine ? 'No answer' : 'Missed voice call';
  const bad = !answered;                    // missed / declined show in red
  const tint = bad ? colors.danger : '#16A34A';
  const arrow = isMine ? 'arrow-up-outline' : 'arrow-down-outline';

  return (
    <View style={styles.row}>
      <TouchableOpacity activeOpacity={0.75} onPress={onCallBack} style={[styles.card, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: tint + '22' }]}>
          <Ionicons name="call" size={18} color={tint} />
          <Ionicons name={arrow as any} size={11} color={tint} style={styles.arrow} />
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{title}</Text>
          <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 1 }}>
            {duration ? `${duration} · ` : ''}{postTime(message.created_at)}
          </Text>
        </View>
        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13, marginLeft: 8 }}>Call back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', marginVertical: 8, paddingHorizontal: 16 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, maxWidth: '92%' },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  arrow: { position: 'absolute', right: 2, top: 3 },
});
