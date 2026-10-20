// Supabase project for Evenly (Project Settings > API).
// The anon key is meant to be public: row level security in supabase/schema.sql protects the data.
window.EVENLY_CONFIG = {
  SUPABASE_URL: 'https://kdikawdhbwpqdcialyky.supabase.co',
  // Public half of the phone-notification key pair. The private half is a secret in Supabase Edge Functions.
  VAPID_PUBLIC_KEY: 'BFzT2bv5JsOr82Fm0Eo9gBpv55QvU_RtJ3m8qHoyUE9N84ww6hIAZvLTE17aw5KwAoXAYiYrxhRMP2WZGfKYKz8',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaWthd2RoYndwcWRjaWFseWt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NTA0ODQsImV4cCI6MjEwODAyNjQ4NH0.KPl7Mb1xxgAyeIyKdE5eWgWHl5WqjqCBrQgyapFkRTs'
};
