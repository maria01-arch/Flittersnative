import { ReactNode } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Text from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

// A "liquid glass" capsule: icon + count side by side. Real blur on iPhone;
// on Android a see-through tint gives the same look.
export default function GlassPill({
  icon,
  label,
  onPress,
  active,
  activeColor,
}: {
  icon: ReactNode;
  label?: string | number;
  onPress: () => void;
  active?: boolean;
  activeColor?: string;
}) {
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}>
      <View style={[styles.pill, active && activeColor ? { borderColor: activeColor } : null]}>
        {Platform.OS === 'ios' ? <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: active && activeColor ? activeColor + '33' : 'rgba(255,255,255,0.14)' }]} />
        <LinearGradient
          colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.row}>
          {icon}
          {label !== undefined && <Text style={styles.label}>{label}</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 34,
    minWidth: 44,
    paddingHorizontal: 11,
    borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
