import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Text from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';

// The ad's call-to-action: a small see-through "liquid glass" pill that sits on
// the bottom-left of the ad picture. A faint frosted tint, a bright thin edge
// and a soft highlight across the top. Real blur on iPhone; on Android (where
// blur isn't reliable) a light dark tint keeps the white label readable.
export default function AdGlassCta({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.wrap} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      <View style={styles.pill}>
        {Platform.OS === 'ios' ? <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'ios' ? 'rgba(255,255,255,0.12)' : 'rgba(20,20,24,0.30)' }]} />
        <LinearGradient
          colors={['rgba(255,255,255,0.42)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.6, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        <Ionicons name="arrow-forward" size={12} color="#fff" style={styles.arrow} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, bottom: 10, maxWidth: '70%' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  label: { color: '#fff', fontSize: 12.5, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  arrow: { marginTop: 1 },
});
