// Settle up: record a payment between two people, or edit one. Suggests the most useful payment first,
// and offers UPI, PayPal or Venmo buttons when the person being paid has added those details.
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from 'react-native';

import { run } from '@/lib/actions';
import { curOf, pairwise, simplify } from '@/lib/money';
import { avatarUrl, expOf, groupBalances, member, membersOf, myId, nameOf, personName, S, useStore } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { curSymbol, fmt, fromMinor, today, toMinor } from '@/lib/util';
import { ConfirmButton, FormBar, Select, Tool } from '@/ui/controls';
import { DateTool } from '@/ui/date-picker';
import { Icon } from '@/ui/icons';
import { Avatar, Button, LineInput, LinkText, Txt } from '@/ui/kit';
import { CURRENCY_OPTIONS, dayLabel } from '@/ui/options';
import { F, useTheme } from '@/ui/theme';

export default function Settle(){
  useStore();
  const p = useLocalSearchParams<{gid: string; from?: string; to?: string; amt?: string; cur?: string; pid?: string}>();
  if (!S.groups[p.gid]) return null;
  return <Form key={p.pid || 'new'} {...p} />;
}

function Form({gid, pid, ...pre}: {gid: string; from?: string; to?: string; amt?: string; cur?: string; pid?: string}){
  const {c} = useTheme();
  const g = S.groups[gid], members = membersOf(gid), p = pid ? S.expenses[pid] : null, me = myId(gid);
  // Start from the payment being edited, the one asked for, or the most useful suggestion.
  const [init] = useState(() => {
    let from = p ? p.paid_by : pre.from, to = p ? Object.keys(p.split)[0] : pre.to, cur = p ? curOf(p, g) : pre.cur, amt = p ? Number(p.amount) : Number(pre.amt || 0);
    if (!from) {
      const all = groupBalances(gid);
      const tx = Object.entries(all).flatMap(([cc, b]) => (g.simplify ? simplify(b) : (pairwise(expOf(gid), g)[cc] || [])).map(t => ({...t, cur: cc})));
      const t = tx.find(x => x.from === me) || tx.find(x => x.to === me) || tx[0];
      if (t) { from = t.from; to = t.to; amt = t.amount; cur = t.cur; } else from = me || members[0].id;
    }
    if (!to) to = members.find(m => m.id !== from)?.id;
    cur = cur || g.currency;
    return {from: from!, to: to!, cur, amt: amt ? fromMinor(amt, cur) : ''};
  });
  const [from, setFrom] = useState(init.from), [to, setTo] = useState(init.to);
  const [cur, setCur] = useState(init.cur), [amt, setAmt] = useState(init.amt);
  const [date, setDate] = useState(p?.date || today());
  const [change, setChange] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const opts = members.map(m => ({value: m.id, label: nameOf(gid, m.id)}));
  const fm = member(gid, from), tm = member(gid, to), tn = nameOf(gid, to);
  const a = toMinor(amt, cur);

  // Buttons that open a payment app with the details filled in, when I'm the one paying.
  const prof = tm?.user_id ? S.profiles[tm.user_id] : null;
  const links: {label: string; icon: string; url: string; primary?: boolean}[] = [];
  if (from === me && prof && a > 0) {
    const v = fromMinor(a, cur), name = personName(tm);
    if (prof.upi_id && cur === 'INR') links.push({primary: true, icon: 'smartphone', label: `Pay ${fmt(a, cur)} with UPI`,
      url: `upi://pay?pa=${encodeURIComponent(prof.upi_id)}&pn=${encodeURIComponent(name)}&am=${v}&cu=INR&tn=${encodeURIComponent('Evenly: ' + (g.is_direct ? 'settle up' : g.name))}`});
    if (prof.paypal_me) links.push({icon: 'credit-card', label: 'PayPal', url: `https://paypal.me/${encodeURIComponent(prof.paypal_me)}/${v}${cur}`});
    if (prof.venmo && cur === 'USD') links.push({icon: 'credit-card', label: 'Venmo', url: `https://venmo.com/${encodeURIComponent(prof.venmo)}?txn=pay&amount=${v}&note=${encodeURIComponent('Evenly')}`});
  }

  async function submit(){
    if (from === to) { setHint('Pick two different people.'); setChange(true); return; }
    if (!(a > 0)) return setHint('Enter an amount above zero.');
    setHint(null);
    const row = {group_id: g.id, kind: 'payment', description: 'Payment', amount: a, paid_by: from, payers: null, split: {[to]: a},
      split_mode: 'exact', split_input: {}, category: 'general', currency: cur, date: date || today()};
    setBusy(true);
    const ok = p ? await run(sb.from('expenses').update(row).eq('id', p.id), `Payment of ${fmt(a, cur)} recorded`)
                 : await run(sb.from('expenses').insert({...row, id: Crypto.randomUUID()}), `Payment of ${fmt(a, cur)} recorded`);
    setBusy(false);
    if (ok) router.back();
  }
  async function remove(){ if (await run(sb.from('expenses').delete().eq('id', p!.id), 'Payment deleted')) router.back(); }

  return (
    <KeyboardAvoidingView style={{flex: 1, backgroundColor: c.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormBar title={p ? 'Edit payment' : 'Settle up'} onClose={() => router.back()} onSave={submit} busy={busy} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 16, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center', alignItems: 'stretch', paddingBottom: 40}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingTop: 12}}>
          <Avatar name={personName(fm)} url={avatarUrl(fm)} size={72} />
          <Icon name="arrow-right" size={28} color={c.muted} />
          <Avatar name={personName(tm)} url={avatarUrl(tm)} size={72} />
        </View>
        <Txt style={{textAlign: 'center', fontSize: 17}}><Txt weight="bold" style={{fontSize: 17}}>{nameOf(gid, from)}</Txt> paid <Txt weight="bold" style={{fontSize: 17}}>{tn === 'You' ? 'you' : tn}</Txt>{'  '}
          <LinkText small title="Change" onPress={() => setChange(!change)} /></Txt>
        {change && (
          <View style={{flexDirection: 'row', gap: 12}}>
            <Select label="Who paid" value={from} options={opts} onChange={setFrom} style={{flex: 1}} />
            <Select label="Paid to" value={to} options={opts} onChange={setTo} style={{flex: 1}} />
          </View>)}
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'center', width: '100%', maxWidth: 360}}>
          <Select label="Currency" value={cur} options={CURRENCY_OPTIONS} search onChange={setCur}>
            {open => <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Currency: ${cur}`}
              style={{width: 56, height: 56, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center'}}>
              <Txt weight="bold" style={{fontSize: 20}}>{curSymbol(cur)}</Txt></Pressable>}
          </Select>
          <LineInput value={amt} onChangeText={setAmt} placeholder="0.00" keyboardType="decimal-pad" accessibilityLabel="Amount"
            style={{fontFamily: F.display, fontSize: 36}} />
        </View>
        {links.length > 0 && (
          <View style={{gap: 8, alignItems: 'center'}}>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center'}}>
              {links.map(l => <Button key={l.label} kind={l.primary ? 'primary' : 'plain'} icon={l.icon} title={l.label} onPress={() => Linking.openURL(l.url).catch(() => {})} />)}
            </View>
            <Txt small muted style={{textAlign: 'center'}}>Opens your payment app with {personName(tm)}’s details filled in. Come back and tap Save once it’s done.</Txt>
            {!!prof?.upi_id && cur === 'INR' && <Txt small muted style={{textAlign: 'center'}}>UPI ID: <Txt small selectable weight="semi">{prof.upi_id}</Txt></Txt>}
          </View>)}
        <Txt small muted style={{textAlign: 'center'}}>Record cash, UPI or bank transfers here once the money has actually moved.</Txt>
        {!!hint && <Txt small color={c.owe} style={{textAlign: 'center'}}>{hint}</Txt>}
        {p && <ConfirmButton title="Delete payment" onConfirm={remove} style={{alignSelf: 'flex-start'}} />}
      </ScrollView>
      <View style={{flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface, paddingHorizontal: 8, paddingVertical: 4}}>
        <DateTool value={date} onChange={setDate} label={dayLabel(date)} />
        <Tool icon={g.is_direct ? 'user' : 'users'} label={g.is_direct ? 'No group' : g.name} />
      </View>
    </KeyboardAvoidingView>
  );
}
