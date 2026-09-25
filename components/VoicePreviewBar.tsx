import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import VoiceMessagePlayer from './VoiceMessagePlayer';

// Shown right after recording stops, before anything is uploaded — plays
// back the local file so you can actually hear what was recorded (and
// confirm it recorded anything at all) before committing to send it.
export default function VoicePreviewBar({
  uri,
  duration,
  onDiscard,
  onSend,
}: {
  uri: string;
  duration: number;
  onDiscard: () => void;
  onSend: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.bar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
      <TouchableOpacity onPress={onDiscard} style={[styles.iconBtn, { backgroundColor: colors.bubbleTheirs }]}>
        <Ionicons name="trash" size={18} color="#F87171" />
      </TouchableOpacity>
      <View style={[styles.previewBox, { backgroundColor: colors.bubbleTheirs }]}>
        <VoiceMessagePlayer url={uri} duration={duration} isMine={false} />
      </View>
      <TouchableOpacity onPress={onSend} style={[styles.iconBtn, { backgroundColor: colors.primary }]}>
        <Ionicons name="send" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 1, gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  previewBox: { flex: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
});
