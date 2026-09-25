import { View, StyleSheet } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';

// Matches the webapp's two badges (see SphereApp.js): a gold-ring
// "Verified" badge and a blue seal-shaped "Authentic" badge with a
// checkmark — not generic Ionicons stand-ins.
//
// The gold badge previously tried to render the actual multi-hundred-point
// Flitters brand logo SVG at 10px. That's almost certainly what made the
// badge stop rendering entirely: react-native-svg doesn't support the full
// SVG spec (filters, some gradient/mask forms in particular), and a
// detailed brand mark is a likely place to hit that. At this size the
// difference is invisible anyway, so this uses simple, guaranteed-supported
// primitives (Path/Polyline only) for both badges instead.
export default function VerifiedBadges({ verified, isAuthentic, size = 14 }: { verified?: boolean; isAuthentic?: boolean; size?: number }) {
  if (!verified && !isAuthentic) return null;
  return (
    <View style={styles.row}>
      {verified && (
        <View
          style={[
            styles.goldBadge,
            {
              width: size + 6,
              height: size + 6,
              borderRadius: (size + 6) / 2,
            },
          ]}
        >
          <Svg width={size - 3} height={size - 3} viewBox="0 0 24 24">
            <Polyline points="4,13 9,18 20,6" fill="none" stroke="#C9A84C" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      )}
      {isAuthentic && (
        <Svg width={size + 6} height={size + 6} viewBox="0 0 24 24">
          <Path
            d="M12 2L14.4 4.8L18 4L18.8 7.6L22 9.2L20.4 12.6L22 16L18.8 17.6L18 21.2L14.4 20.4L12 23.2L9.6 20.4L6 21.2L5.2 17.6L2 16L3.6 12.6L2 9.2L5.2 7.6L6 4L9.6 4.8Z"
            fill="#1877F2"
          />
          <Polyline points="8,12.5 10.5,15 16,9" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  goldBadge: {
    backgroundColor: '#16213e',
    borderWidth: 1.5,
    borderColor: '#C9A84C',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
