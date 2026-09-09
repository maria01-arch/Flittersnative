import { Tabs } from 'expo-router';
import React from 'react';
import { HapticTab } from '@/components/haptic-tab';
import FloatingTabBar from '@/components/FloatingTabBar';
import { TabBarVisibilityProvider } from '@/lib/tab-bar-visibility';

export default function TabLayout() {
  return (
    <TabBarVisibilityProvider>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarButton: HapticTab,
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
