import { Tabs } from 'expo-router';
import React from 'react';
import { HapticTab } from '@/components/haptic-tab';
import FloatingTabBar from '@/components/FloatingTabBar';
import { TabBarVisibilityProvider } from '@/lib/tab-bar-visibility';
import { useTheme } from '@/lib/ThemeContext';

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <TabBarVisibilityProvider>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarButton: HapticTab,
          // Same white-flash fix as the root Stack — covers the brief
          // moment between tapping a tab and its screen's own background
          // painting in.
          sceneStyle: { backgroundColor: colors.bg },
          // Explicit, not assumed: a tab screen's own data-fetching
          // effects run the moment it mounts, so if every tab mounted
          // eagerly at launch, Messages would fetch every conversation
          // preview, Notifications would fetch the whole notification
          // list, Reels would start loading video, etc. — all before the
          // person ever left the Home tab. lazy:true means a tab's
          // screen, and everything its own useEffect does, doesn't exist
          // at all until that tab is actually opened once.
          lazy: true,
        }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="search" />
        <Tabs.Screen name="notifications" />
        <Tabs.Screen name="messages" />
        <Tabs.Screen name="reels" />
      </Tabs>
    </TabBarVisibilityProvider>
  );
}
