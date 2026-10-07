import { Stack, useRouter, useSegments, ThemeProvider as RNThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import 'react-native-reanimated';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { InboxProvider } from '@/lib/InboxContext';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/lib/ThemeContext';
import { PreferencesProvider } from '@/lib/PreferencesContext';
import { usePushNotifications } from '@/lib/usePushNotifications';
import { isAddingAccountMode } from '@/lib/accounts';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function RootLayoutNav() {
  const { session, initializing } = useAuth();
  const { colors, isDark } = useTheme();
  usePushNotifications();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const inAuthGroup = segments[0] === 'login' || segments[0] === 'landing' || segments[0] === 'signup';
    if (!session && !inAuthGroup) {
      router.replace('/landing');
    } else if (session && inAuthGroup && !isAddingAccountMode()) {
      router.replace('/(tabs)');
    }
  }, [session, initializing, segments]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg);
  }, [colors.bg]);

  const navTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      dark: isDark,
      colors: {
        ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
        primary: colors.primary,
        background: colors.bg,
        card: colors.card,
        text: colors.text,
        border: colors.border,
        notification: colors.primary,
      },
    }),
    [isDark, colors]
  );

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <RNThemeProvider value={navTheme}>
      <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="landing" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="compose" options={{ presentation: 'modal', headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
        <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="user/[id]/following" options={{ headerShown: false }} />
        <Stack.Screen name="post/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="conversation/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="comment/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="groups/create" options={{ presentation: 'modal', headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
        <Stack.Screen name="groups/settings" options={{ headerShown: false }} />
        <Stack.Screen name="groups/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal', headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="new-message" options={{ presentation: 'modal', headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
        <Stack.Screen name="flitters-ai" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="legal/[doc]" options={{ headerShown: false }} />
        <Stack.Screen name="switch-account" options={{ headerShown: false }} />
      </Stack>
    </RNThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <PreferencesProvider>
          <AuthProvider>
            <InboxProvider>
              <RootLayoutNav />
              <StatusBar style="auto" />
            </InboxProvider>
          </AuthProvider>
        </PreferencesProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
