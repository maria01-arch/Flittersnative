import { StyleSheet, Animated, Platform } from 'react-native';
import TouchableOpacity from './PressScale';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { useUnread } from '@/lib/UnreadContext';
import { useTabBarVisibility, HIDE_DISTANCE } from '@/lib/tab-bar-visibility';
import { useTheme } from '@/lib/ThemeContext';

const ICONS: Record<string, [string, string]> = {
  index: ['home-outline', 'home'],
  search: ['search-outline', 'search'],
  notifications: ['notifications-outline', 'notifications'],
  messages: ['chatbubble-outline', 'chatbubble'],
  reels: ['play-circle-outline', 'play-circle'],
};

export default function FloatingTabBar({ state, navigation }: any) {
  // Sit above the phone's own navigation bar (3-button or gesture strip)
  // instead of at a fixed height that it can overlap.
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { clamped } = useTabBarVisibility();
  const { notifUnread, msgUnread } = useUnread();
  const focusedRoute = state.routes[state.index]?.name;

  if (focusedRoute === 'reels') return null;

  const translateY = clamped.interpolate({ inputRange: [0, HIDE_DISTANCE], outputRange: [0, 100] });
  const opacity = clamped.interpolate({ inputRange: [0, HIDE_DISTANCE], outputRange: [1, 0] });

  return (
    <Animated.View
      style={[
        styles.wrap,
        { bottom: Platform.OS === 'ios' ? 30 : 12 + insets.bottom },
        {
          transform: [{ translateY }],
          opacity,
          backgroundColor: colors.card,
          shadowColor: isDark ? '#000' : '#000',
          shadowOpacity: isDark ? 0.4 : 0.12,
          borderWidth: isDark ? 1 : 0,
          borderColor: colors.border,
        },
      ]}
    >
      {state.routes.map((route: any, index: number) => {
        const focused = state.index === index;
        const icons = ICONS[route.name] || ['ellipse-outline', 'ellipse'];
        const iconName = focused ? icons[1] : icons[0];
        const showDot = (route.name === 'notifications' && notifUnread > 0) || (route.name === 'messages' && msgUnread > 0);

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.item}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
          >
            <View>
              <Ionicons name={iconName as any} size={24} color={focused ? colors.primary : colors.faint} />
              {showDot && <View style={[styles.dot, { borderColor: colors.card }]} />}
            </View>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', top: -2, right: -4, width: 11, height: 11, borderRadius: 6, backgroundColor: '#EF4444', borderWidth: 2 },
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: Platform.OS === 'ios' ? 30 : 18,
    height: 60,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
});
