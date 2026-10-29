// Sign in, create an account, or reset a password. Google is one tap.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { appUrl, signInWithGoogle, takeOAuthError } from '@/lib/auth';
import { pendingInvite } from '@/lib/pending';
import { friendly } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { validEmail } from '@/lib/util';
import { Button, Card, Field, Hint, LinkText, Screen, Title, Txt } from '@/ui/kit';
import { F, useTheme } from '@/ui/theme';

type Mode = 'signin' | 'signup' | 'reset';

// Read once when the app opens: the reason Google sent someone back without signing in, if any.
const oauthError = takeOAuthError();

// Google's own "G" mark, which its sign-in button guidelines ask for.
function GoogleG(){
  return <Svg width={18} height={18} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.730-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </Svg>;
}

export default function SignIn(){
  const {c} = useTheme();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [pass, setPass] = useState('');
  const [hint, setHint] = useState<{text: string; ok?: boolean} | null>(oauthError ? {text: `Google sign-in didn’t finish: ${friendly(oauthError)}`} : null);
  const [busy, setBusy] = useState<'form' | 'google' | null>(null);

  const switchTo = (m: Mode) => { setMode(m); setHint(null); };

  async function google(){
    setHint(null); setBusy('google');
    try { await signInWithGoogle(); } catch (err) { setHint({text: friendly(err)}); }
    finally { setBusy(null); }
  }
  async function submit(){
    const e = email.trim().toLowerCase();
    if (mode === 'signup' && !name.trim()) return setHint({text: 'Tell us your name so friends recognise you.'});
    if (!validEmail(e)) return setHint({text: 'Enter a valid email address.'});
    if (mode !== 'reset' && pass.length < 6) return setHint({text: 'Use a password with at least 6 characters.'});
    setHint(null); setBusy('form');
    const res = mode === 'signup' ? await sb.auth.signUp({email: e, password: pass, options: {data: {name: name.trim()}, emailRedirectTo: appUrl()}})
      : mode === 'reset' ? await sb.auth.resetPasswordForEmail(e, {redirectTo: appUrl()})
      : await sb.auth.signInWithPassword({email: e, password: pass});
    setBusy(null);
    if (res.error) return setHint({text: friendly(res.error)});
    if (mode === 'signup' && !(res.data as any)?.session) setHint({ok: true, text: `Check ${e} for a confirmation link, then come back and sign in.`});
    else if (mode === 'reset') setHint({ok: true, text: `If an account exists for ${e}, a reset link is on its way.`});
  }

  const title = mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Sign in';
  const sub = mode === 'signup' ? 'Split trips, rent and dinners with friends. Free.' : mode === 'reset' ? 'We’ll email you a link to choose a new password.' : 'Welcome back. Your balances are waiting.';
  return (
    <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen bottom={40}>
        <View style={{maxWidth: 420, width: '100%', alignSelf: 'center', gap: 16, marginTop: 32}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
            <View style={{width: 30, height: 30, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center'}}>
              <Txt weight="bold" color={c.accentInk} style={{fontSize: 17}}>E</Txt>
            </View>
            <Txt style={{fontFamily: F.displayBlack, fontSize: 26, lineHeight: 32}}>Evenly</Txt>
          </View>
          {!!pendingInvite() && (
            <View style={{backgroundColor: c.accent + '1a', borderRadius: 14, padding: 12}}>
              <Txt small>You’ve been invited to split expenses on Evenly. Sign in or create an account to join.</Txt>
            </View>)}
          <Card style={{gap: 14}}>
            <Title style={{fontSize: 28, lineHeight: 34}}>{title}</Title>
            <Txt muted>{sub}</Txt>
            {mode !== 'reset' && <>
              <Button title="Continue with Google" left={<GoogleG />} onPress={google} busy={busy === 'google'} />
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                <View style={{flex: 1, height: 1, backgroundColor: c.line}} /><Txt small muted>or with email</Txt><View style={{flex: 1, height: 1, backgroundColor: c.line}} />
              </View>
            </>}
            {mode === 'signup' && <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" maxLength={40} placeholder="Asha Patel" />}
            <Field label="Email" value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
            {mode !== 'reset' && <Field label="Password" value={pass} onChangeText={setPass} secureTextEntry autoCapitalize="none"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? 'At least 6 characters' : ''} onSubmitEditing={submit} />}
            <Hint text={hint?.text} ok={hint?.ok} />
            <Button kind="primary" title={mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'} onPress={submit} busy={busy === 'form'} />
            {mode === 'signin' && <LinkText small title="Forgot your password?" onPress={() => switchTo('reset')} />}
          </Card>
          <View style={{alignItems: 'center'}}>
            {mode === 'signup' ? <Txt>Already have an account? <LinkText title="Sign in" onPress={() => switchTo('signin')} /></Txt>
              : mode === 'reset' ? <LinkText title="Back to sign in" onPress={() => switchTo('signin')} />
              : <Txt>New here? <LinkText title="Create an account" onPress={() => switchTo('signup')} /></Txt>}
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
