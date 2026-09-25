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
