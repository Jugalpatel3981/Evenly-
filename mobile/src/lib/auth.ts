// Signing in with Google, on the web and on phones.
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { sb } from './supabase';

export const appUrl = () => (Platform.OS === 'web' ? window.location.origin + '/' : makeRedirectUri({path: 'auth'}));

// Web: leave for Google and come back to the app with the session in the address.
// Phones: open Google in an in-app browser, which hands back a one-time code for a session.
export async function signInWithGoogle(): Promise<void> {
  const queryParams = {prompt: 'select_account'};
  if (Platform.OS === 'web') {
    const {error} = await sb.auth.signInWithOAuth({provider: 'google', options: {redirectTo: appUrl(), queryParams}});
    if (error) throw error;
    return;
  }
  const redirectTo = appUrl();
  const {data, error} = await sb.auth.signInWithOAuth({provider: 'google', options: {redirectTo, skipBrowserRedirect: true, queryParams}});
  if (error) throw error;
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return;   // closed or cancelled
  const back = new URL(res.url);
  const params = new URLSearchParams(back.search || back.hash.slice(1));
  const failed = params.get('error_description') || params.get('error');
  if (failed) throw new Error(failed.replace(/\+/g, ' '));
  const code = params.get('code');
  if (!code) throw new Error('Google sign-in didn’t finish. Try again.');
  const {error: exErr} = await sb.auth.exchangeCodeForSession(code);
  if (exErr) throw exErr;
}

// Web: if Google sent someone back with an error, read it once and clean the address.
export function takeOAuthError(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search), h = new URLSearchParams(window.location.hash.slice(1));
  const msg = q.get('error_description') || h.get('error_description') || q.get('error') || h.get('error');
  if (msg) window.history.replaceState(null, '', window.location.pathname);
  return msg ? msg.replace(/\+/g, ' ') : null;
}
