// The Supabase project behind Evenly. The anon key is meant to be public:
// row level security in supabase/schema.sql protects the data.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

export const SUPABASE_URL = 'https://kdikawdhbwpqdcialyky.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaWthd2RoYndwcWRjaWFseWt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NTA0ODQsImV4cCI6MjEwODAyNjQ4NH0.KPl7Mb1xxgAyeIyKdE5eWgWHl5WqjqCBrQgyapFkRTs';

const web = Platform.OS === 'web';
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // On the web, the browser's own storage, so people signed in on the current site stay signed in.
    storage: web ? undefined : AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: web,
    // Phones get the sign-in result back as a one-time code instead of tokens in the address.
    flowType: web ? 'implicit' : 'pkce',
  },
});

// Phones: only refresh the session while the app is open.
if (!web) {
  AppState.addEventListener('change', s => { if (s === 'active') sb.auth.startAutoRefresh(); else sb.auth.stopAutoRefresh(); });
}
