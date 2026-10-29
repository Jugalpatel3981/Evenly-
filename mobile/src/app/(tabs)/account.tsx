// Account tab: profile, default currency, appearance, how friends can pay you, email, password, sign out, delete account.
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { run } from '@/lib/actions';
import { appUrl } from '@/lib/auth';
import { friendly, loadAll, myName, myProfile, uid, useStore } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { validEmail } from '@/lib/util';
import { Select } from '@/ui/controls';
import { Icon, type IconName } from '@/ui/icons';
import { AppBar, Avatar, Button, Card, Field, H2, LinkText, Screen, Seg, Title, Txt } from '@/ui/kit';
import { CURRENCY_OPTIONS } from '@/ui/options';
import { setThemePref, useTheme, useThemePref, type ThemePref } from '@/ui/theme';
import { toast } from '@/ui/toast';

const SITE = 'https://evenly-tracker.netlify.app';

function Section({title, icon, children, danger}: {title?: string; icon?: IconName; children: ReactNode; danger?: boolean}){
  const {c} = useTheme();
  return (
    <Card style={danger ? {borderColor: c.owe + '66'} : undefined}>
      {!!title && <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
        {icon && <Icon name={icon} size={15} color={danger ? c.owe : c.muted} />}
        <H2 style={{fontSize: 17, color: danger ? c.owe : c.ink}}>{title}</H2></View>}
      {children}
    </Card>
  );
}
// A text field with its button beside it, like the website's inline forms.
function Inline({children, button}: {children: ReactNode; button: ReactNode}){
  return <View style={{flexDirection: 'row', alignItems: 'flex-end', gap: 10}}><View style={{flex: 1}}>{children}</View>{button}</View>;
}

export default function AccountTab(){
  const S = useStore();
  const pref = useThemePref();
  const p = myProfile() || ({} as Record<string, any>);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState(''), [pass, setPass] = useState(''), [del, setDel] = useState('');
  const [upi, setUpi] = useState<string | null>(null), [paypal, setPaypal] = useState<string | null>(null), [venmo, setVenmo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const site = Platform.OS === 'web' ? window.location.origin : SITE;

  const saveName = async () => {
    const n = (name ?? myName()).trim();
    if (!n) return toast('Enter your name.');
    setBusy('name');
    const ok = await run(sb.rpc('update_my_name', {p_name: n}), 'Name updated');
    if (ok) { await sb.auth.updateUser({data: {name: n}}); setName(null); }
    setBusy(null);
  };
  const saveCurrency = (cur: string) => run(sb.from('profiles').upsert({id: uid(), name: myName(), default_currency: cur}, {onConflict: 'id'}), 'Default currency saved');
  const savePay = async () => {
    const u = (upi ?? p.upi_id ?? '').trim(), pp = (paypal ?? p.paypal_me ?? '').trim().replace(/^.*paypal\.me\//i, '').replace(/\/.*$/, ''), v = (venmo ?? p.venmo ?? '').trim().replace(/^@/, '');
    if (u && !/^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/.test(u)) return toast('A UPI ID looks like name@bank, for example jugal@okaxis.');
    if (pp && !/^[A-Za-z0-9]{1,40}$/.test(pp)) return toast('Enter just your PayPal.me username, letters and numbers only.');
    if (v && !/^[A-Za-z0-9_-]{1,40}$/.test(v)) return toast('Enter just your Venmo username, without the @.');
    setBusy('pay');
    if (await run(sb.from('profiles').upsert({id: uid(), name: myName(), upi_id: u || null, paypal_me: pp || null, venmo: v || null}, {onConflict: 'id'}), 'Payment details saved')) {
      setUpi(null); setPaypal(null); setVenmo(null); loadAll().catch(() => {});
    }
    setBusy(null);
  };
  const changeEmail = async () => {
    const e = email.trim().toLowerCase();
    if (!validEmail(e)) return toast('Enter a valid email address.');
    setBusy('email');
    const {error} = await sb.auth.updateUser({email: e}, {emailRedirectTo: appUrl()});
    setBusy(null);
    toast(error ? friendly(error) : `Check ${e} (and your current inbox) for a confirmation link.`);
    if (!error) setEmail('');
  };
  const changePass = async () => {
    if (pass.length < 6) return toast('Use a password with at least 6 characters.');
    setBusy('pass');
    const {error} = await sb.auth.updateUser({password: pass});
    setBusy(null);
    toast(error ? friendly(error) : 'Password changed');
    if (!error) setPass('');
  };
  const deleteAccount = async () => {
    if (del.trim() !== 'DELETE') return toast('Type DELETE in capitals to confirm.');
    setBusy('del');
    const {error} = await sb.rpc('delete_my_account');
    setBusy(null);
    if (error) return toast(friendly(error));
    await sb.auth.signOut();
    toast('Your account has been deleted');
  };
  const openPrivacy = () => Platform.OS === 'web' ? window.open(`${SITE}/privacy.html`, '_blank') : WebBrowser.openBrowserAsync(`${SITE}/privacy.html`);
  const themeIcon: IconName = pref === 'dark' ? 'moon' : pref === 'light' ? 'sun' : 'smartphone';

  return (
    <Screen>
      <AppBar />
      <Title>Account</Title>
      <Section>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 14}}>
          <Avatar name={myName()} url={p.avatar_url} size={72} />
          <View style={{flex: 1}}><Txt weight="bold" style={{fontSize: 18}}>{myName()}</Txt><Txt muted selectable>{S.session?.user?.email}</Txt></View>
        </View>
        <Inline button={<Button title="Save" onPress={saveName} busy={busy === 'name'} />}>
          <Field label="Your name" value={name ?? myName()} onChangeText={setName} maxLength={40} autoComplete="name" />
        </Inline>
        <Select label="Default currency for new groups and friends" value={p.default_currency || 'INR'} options={CURRENCY_OPTIONS} search onChange={saveCurrency} />
      </Section>
      <Section title="Appearance" icon={themeIcon}>
        <Seg<ThemePref> value={pref} onChange={setThemePref} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} />
        <Txt small muted>System follows your phone’s light or dark setting. Saved on this device.</Txt>
      </Section>
      <Section title="How friends can pay you" icon="wallet">
        <Txt small muted>Friends who owe you see a pay button when they settle up. Leave blank anything you don’t use.</Txt>
        <Field label="UPI ID" value={upi ?? p.upi_id ?? ''} onChangeText={setUpi} placeholder="yourname@okaxis" autoCapitalize="none" autoComplete="off" />
        <View style={{flexDirection: 'row', gap: 10}}>
          <View style={{flex: 1}}><Field label="PayPal.me username" value={paypal ?? p.paypal_me ?? ''} onChangeText={setPaypal} placeholder="jugalpatel" autoCapitalize="none" autoComplete="off" /></View>
          <View style={{flex: 1}}><Field label="Venmo username" value={venmo ?? p.venmo ?? ''} onChangeText={setVenmo} placeholder="jugal-patel" autoCapitalize="none" autoComplete="off" /></View>
        </View>
        <Button title="Save" onPress={savePay} busy={busy === 'pay'} style={{alignSelf: 'flex-end'}} />
      </Section>
      <Section title="Email" icon="mail">
        <Inline button={<Button title="Change" onPress={changeEmail} busy={busy === 'email'} />}>
          <Field label="New email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder={S.session?.user?.email} />
        </Inline>
        <Txt small muted>We’ll send a confirmation link to the new address. Groups that invited your old email keep working.</Txt>
      </Section>
      <Section title="Password" icon="key-round">
        <Inline button={<Button title="Change" onPress={changePass} busy={busy === 'pass'} />}>
          <Field label="New password" value={pass} onChangeText={setPass} secureTextEntry autoComplete="new-password" placeholder="At least 6 characters" />
        </Inline>
      </Section>
      <Section title="Invite friends to Evenly" icon="share-2">
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <Txt selectable style={{flex: 1}} numberOfLines={1}>{site}</Txt>
          <Button small icon="copy" title="Copy link" onPress={async () => { await Clipboard.setStringAsync(site); toast('Copied'); }} />
        </View>
      </Section>
      <Section>
        <Button title="Sign out" icon="log-out" onPress={() => sb.auth.signOut()} />
        <LinkText small title="Privacy policy" onPress={openPrivacy} />
      </Section>
      <Section title="Delete account" danger>
        <Txt small muted>Your login is deleted. Groups and expenses stay for your friends, under your name. This can’t be undone.</Txt>
        <Inline button={<Button kind="danger" title="Delete my account" onPress={deleteAccount} busy={busy === 'del'} />}>
          <Field label="Type DELETE to confirm" value={del} onChangeText={setDel} autoCapitalize="characters" autoComplete="off" />
        </Inline>
      </Section>
    </Screen>
  );
}
