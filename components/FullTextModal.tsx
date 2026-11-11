import { Modal, View, ScrollView, TouchableOpacity, Pressable, StyleSheet, Platform } from 'react-native';
import Text from '@/components/AppText';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBlurTarget, blurTargetSupported } from '@/lib/blurTarget';
import { useTheme } from '@/lib/ThemeContext';
import LinkifiedText from './LinkifiedText';

// "Read in full": the whole message in a scrollable card over the same blurred
// background the long-press menu uses, with a Close button. It is a separate
// screen layer, so a very long message can be read even though the action
// menu has no room to show it.
export default function FullTextModal({ visible, text, onClose }: { visible: boolean; text: string; onClose: () => void }) {
  const { colors, isDark } = useTheme();
  const blurTarget = useBlurTarget();
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  const androidBlur = Platform.OS === 'android' && blurTargetSupported && !!blurTarget?.current && Number(Platform.Version) >= 31;
  const veil = androidBlur ? 'rgba(0,0,0,0)' : isDark ? 'rgba(8,11,18,0.94)' : 'rgba(18,22,31,0.82)';
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {Platform.OS === 'ios' ? <BlurView intensity={85} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null}
          {androidBlur ? (
            <BlurView
              blurTarget={blurTarget as any}
              blurMethod="dimezisBlurViewSdk31Plus"
              intensity={isDark ? 14.5 : 11.4}
              blurReductionFactor={isDark ? 0.3 : 0.24}
              tint={isDark ? 'dark' : 'default'}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'ios' ? (isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.18)') : veil }]} />
        </View>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {/* Extra darkening under the words so they stay easy to read on any chat. */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.38)' }]} pointerEvents="none" />
        <ScrollView
          style={StyleSheet.absoluteFill}
          contentContainerStyle={{ paddingTop: insets.top + 70, paddingBottom: insets.bottom + 40, paddingHorizontal: 22 }}
          showsVerticalScrollIndicator={false}
        >
          <LinkifiedText text={text} style={styles.text} linkColor="#9CCBFF" />
        </ScrollView>
        <TouchableOpacity onPress={onClose} activeOpacity={0.8} style={[styles.closeBtn, { top: insets.top + 14 }]}>
          <Ionicons name="close" size={18} color="#fff" />
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  text: { color: '#fff', fontSize: 17, lineHeight: 26, textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  closeBtn: { position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.22)' },
  closeText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
