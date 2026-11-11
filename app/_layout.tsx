import { Stack, useRouter, useSegments, ThemeProvider as RNThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import 'react-native-reanimated';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { InboxProvider } from '@/lib/InboxContext';
import { UnreadProvider } from '@/lib/UnreadContext';
import DialogHost from '@/components/DialogHost';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/lib/ThemeContext';
import { PreferencesProvider } from '@/lib/PreferencesContext';
import { usePushNotifications } from '@/lib/usePushNotifications';
import { useBillingRefresh } from '@/lib/billingRefresh';
import { isAddingAccountMode } from '@/lib/accounts';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ShareProvider, useIncomingShare } from '@/lib/shareIntent';
import { useBanWatch } from '@/lib/useBanWatch';
import { hasPendingBan } from '@/lib/banInfo';
import UpdateGate from '@/components/UpdateGate';

function RootLayoutNav() {
  const { session, initializing } = useAuth();
  const { colors, isDark } = useTheme();
  usePushNotifications();
  const { hasShareIntent } = useIncomingShare();
  useBillingRefresh();
  useBanWatch();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const inAuthGroup = segments[0] === 'login' || segments[0] === 'landing' || segments[0] === 'signup' || segments[0] === 'forgot-password';
    if (!session && !inAuthGroup) {
      // A person who was just banned goes straight to the ban page (on the login screen).
      router.replace(hasPendingBan() ? '/login' : '/landing');
    } else if (session && inAuthGroup && !isAddingAccountMode()) {
      router.replace('/(tabs)');
    }
  }, [session, initializing, segments]);

  // Something was shared into Flitters from another app: open the picker.
  useEffect(() => {
    if (initializing || !session || !hasShareIntent) return;
    if (segments[0] === 'share-to') return;
    router.push('/share-to');
  }, [hasShareIntent, session, initializing]);

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
        <Stack.Screen name="join/[tag]" options={{ headerShown: false }} />
        <Stack.Screen name="hashtag/[tag]" options={{ headerShown: false }} />
        <Stack.Screen name="u/[username]" options={{ headerShown: false }} />
        <Stack.Screen name="p/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="get-verified" options={{ headerShown: false }} />
        <Stack.Screen name="moment/[uid]" options={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
        <Stack.Screen name="moment-new" options={{ headerShown: false, animation: 'slide_from_bottom', contentStyle: { backgroundColor: '#000' } }} />
        <Stack.Screen name="saved" options={{ title: 'Saved posts' }} />
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
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="legal/[doc]" options={{ headerShown: false }} />
        <Stack.Screen name="switch-account" options={{ headerShown: false }} />
        <Stack.Screen name="share-to" options={{ presentation: 'transparentModal', headerShown: false, contentStyle: { backgroundColor: 'transparent' }, animation: 'fade' }} />
        <Stack.Screen name="scan" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack>
      <UpdateGate />
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
              <UnreadProvider>
                <ShareProvider>
                  <RootLayoutNav />
                </ShareProvider>
                <DialogHost />
                <StatusBar style="auto" />
              </UnreadProvider>
            </InboxProvider>
          </AuthProvider>
        </PreferencesProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
