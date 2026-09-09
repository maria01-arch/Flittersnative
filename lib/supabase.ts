import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = 'https://qjhxvefwsexlalxpkbps.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqaHh2ZWZ3c2V4bGFseHBrYnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTA2MDMsImV4cCI6MjA5Mzg4NjYwM30.Yf-3OrP1AfzvBbldLJEJiU-h-MWfntUgvEnY1OFtJBs';

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
