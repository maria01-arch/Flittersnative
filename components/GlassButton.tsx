import { ReactNode } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Text from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

// A round "liquid glass" button: a frosted translucent disc with a bright
// edge and a soft highlight across the top. Real blur on iPhone; on Android
// (where blur is not reliable) a see-through tint gives the same look.
export default function GlassButton({
  icon,
  label,
  onPress,
  size = 48,
  active,
  activeColor,
}: {
  icon: ReactNode;
  label?: string | number;
  onPress: () => void;
  size?: number;
  active?: boolean;
  activeColor?: string;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <TouchableOpacity activeOpacity={0.75} onPress={onPress} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
        <View
          style={[
            styles.disc,
            { width: size, height: size, borderRadius: size / 2 },
            active && activeColor ? { borderColor: activeColor } : null,
          ]}
        >
          {Platform.OS === 'ios' ? <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} /> : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: active && activeColor ? activeColor + '33' : 'rgba(255,255,255,0.14)' }]} />
          <LinearGradient
            colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.7, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
          />
          <View style={styles.iconWrap}>{icon}</View>
        </View>
      </TouchableOpacity>
      {label !== undefined && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  label: { color: '#fff', fontSize: 12, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
});
