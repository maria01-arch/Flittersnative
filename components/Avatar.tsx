import { useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';

// Used everywhere a user/group avatar is shown. Previously, a missing
// avatar_url fell back to an external placehold.co URL — which meant a
// blank box whenever that request was slow, blocked, or the phone had no
// signal. This never hits the network for its fallback: no avatar_url (or
// a failed load) just shows a plain person icon on a tinted circle,
// always, instantly.
export default function Avatar({
  uri,
  size = 40,
  color,
}: {
  uri?: string | null;
  size?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  const bg = color || colors.border;
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return (
      <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
        <Ionicons name="person" size={size * 0.58} color={colors.subtext} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.image, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: { justifyContent: 'center', alignItems: 'center' },
  image: {},
});
