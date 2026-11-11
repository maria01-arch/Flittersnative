import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = 'https://xxsfkjhfixognmnzixie.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4c2ZramhmaXhvZ25tbnppeGllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNTgyNTcsImV4cCI6MjEwNzkzNDI1N30.ZiXwmG1_xTw4MnufCs3NJzbN7IbbjYtJ_-6oH15EYNo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: {
    // React Native's WebSocket layer needs an explicit, frequent heartbeat
    // or the connection silently dies without either side noticing —
    // browsers handle this automatically, RN does not.
    heartbeatIntervalMs: 15000,
    reconnectAfterMs: (tries: number) => Math.min(1000 * Math.pow(2, tries), 10000),
    timeout: 20000,
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.realtime.connect();
  }
});
