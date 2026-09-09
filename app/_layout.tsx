import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { InboxProvider } from '@/lib/InboxContext';
import { ThemeProvider as AppThemeProvider } from '@/lib/ThemeContext';
import { PreferencesProvider } from '@/lib/PreferencesContext';
import { View, ActivityIndicator } from 'react-native';

function RootLayoutNav() {
  const { session, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const inAuthGroup = segments[0] === 'login' || segments[0] === 'landing' || segments[0] === 'signup';
    if (!session && !inAuthGroup) {
      router.replace('/landing');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, initializing, segments]);

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      <Stack.Screen name="compose" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="post/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="conversation/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="comment/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="groups/create" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="groups/settings" options={{ headerShown: false }} />
      <Stack.Screen name="groups/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="edit-profile" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="new-message" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="flitters-ai" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
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
  );
}
