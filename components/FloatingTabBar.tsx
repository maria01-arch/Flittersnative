import { TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
  const { colors, isDark } = useTheme();
  const { clamped } = useTabBarVisibility();
  const focusedRoute = state.routes[state.index]?.name;

  if (focusedRoute === 'reels') return null;

  const translateY = clamped.interpolate({ inputRange: [0, HIDE_DISTANCE], outputRange: [0, 100] });
  const opacity = clamped.interpolate({ inputRange: [0, HIDE_DISTANCE], outputRange: [1, 0] });

  return (
    <Animated.View
      style={[
        styles.wrap,
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

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.item}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
          >
            <Ionicons name={iconName as any} size={24} color={focused ? colors.primary : colors.faint} />
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
