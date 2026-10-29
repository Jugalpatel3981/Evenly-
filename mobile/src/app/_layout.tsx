// The app shell: fonts, theme, and the sign-in gate. Signed out you only see sign-in; signed in, the tabs.
import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold, InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans';
import type { Session } from '@supabase/supabase-js';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { boot, emit, S, teardown } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { useTheme } from '@/ui/theme';
import { ToastHost } from '@/ui/toast';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Root(){
  const {c, isDark} = useTheme();
  const [fonts] = useFonts({BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold,
    InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold, InstrumentSans_700Bold});
  // undefined until Supabase has read the saved session.
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const {data} = sb.auth.onAuthStateChange((_event, s) => {
      S.session = s; setSession(s);
      // Defer: calling Supabase inside this callback can deadlock its auth lock.
      if (s) setTimeout(boot, 0); else teardown();
      emit();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const ready = fonts && session !== undefined;
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  if (!ready) return null;

  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {...base, colors: {...base.colors, background: c.bg, card: c.surface, text: c.ink, border: c.line, primary: c.accent}};
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{headerShown: false, contentStyle: {backgroundColor: c.bg}}}>
        <Stack.Protected guard={!!session} redirectTo="/sign-in">
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="group/[id]" />
          <Stack.Screen name="friend/[key]" />
          <Stack.Screen name="expense/[id]" />
          {/* Forms slide up over the page they were opened from. */}
          {['expense-form', 'settle', 'group-form', 'friend-form', 'add-friend', 'search', 'pick', 'multi', 'deleted', 'filter'].map(n =>
            <Stack.Screen key={n} name={n} options={{presentation: 'fullScreenModal', animation: 'slide_from_bottom'}} />)}
        </Stack.Protected>
        <Stack.Protected guard={!session} redirectTo="/">
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Screen name="auth" />
      </Stack>
      <ToastHost />
    </ThemeProvider>
  );
}
