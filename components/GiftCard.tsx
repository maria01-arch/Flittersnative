import { View, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import { useTheme } from '@/lib/ThemeContext';
import { postTime } from '@/lib/timeAgo';

// The card in a chat for a gift ("🌹 Sent a Rose"). The server writes the message text.
export default function GiftCard({ message, isMine }: { message: any; isMine: boolean }) {
  const { colors } = useTheme();
  const text: string = message.content || '';
  const emoji = Array.from(text)[0] || '🎁';
  const name = text.replace(/^\S+\s*Sent a /, '').trim() || 'gift';
  return (
    <View style={styles.row}>
      <View style={[styles.card, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '55' }]}>
        <Text style={{ fontSize: 42 }}>{emoji}</Text>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14, marginTop: 4 }}>{isMine ? `You sent a ${name}` : `Sent you a ${name}`}</Text>
        <Text style={{ color: colors.subtext, fontSize: 11.5, marginTop: 2 }}>{postTime(message.created_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', marginVertical: 8, paddingHorizontal: 16 },
  card: { alignItems: 'center', borderWidth: 1.5, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 26 },
});
