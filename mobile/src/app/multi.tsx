// One bill with several friends, outside any group: each friend's share goes into your one-to-one ledger with them.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { ensureLedger, run } from '@/lib/actions';
import { guessCategory } from '@/lib/categories';
import { defaultCurrency, friendly, friendOf, friendsIndex, loadAll, myId, myName, type Friend } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { today, toMinor } from '@/lib/util';
import { FormBar, Select } from '@/ui/controls';
import { DateTool } from '@/ui/date-picker';
import { Field, Loading, Txt } from '@/ui/kit';
import { CATEGORY_OPTIONS, CURRENCY_OPTIONS, dayLabel } from '@/ui/options';
import { computeFor, initialSplit, SplitEditor, type SplitState } from '@/ui/split-editor';
import { useTheme } from '@/ui/theme';
import { toast } from '@/ui/toast';

type Ready = Friend & {gid: string; mymid: string; fmid: string};

export default function Multi(){
  const {keys} = useLocalSearchParams<{keys: string}>();
  const [friends, setFriends] = useState<Ready[] | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const idx = friendsIndex(), list: (Friend & {gid: string})[] = [];
        for (const k of keys.split(',')) { const f = idx.get(k)!; list.push({...f, gid: await ensureLedger(f)}); }
        await loadAll();
        if (live) setFriends(list.map(f => ({...f, mymid: myId(f.gid)!, fmid: friendOf(f.gid)!.id})));
      } catch (err) { toast(friendly(err)); router.back(); }
    })();
    return () => { live = false; };
  }, [keys]);
  if (!friends) return <Loading text="Getting ready…" />;
  return <Form friends={friends} />;
}

function Form({friends}: {friends: Ready[]}){
  const {c} = useTheme();
  const people = [{id: 'me', name: 'You'}, ...friends.map(f => ({id: f.key, name: f.name}))];
  const [desc, setDesc] = useState(''), [amt, setAmt] = useState(''), [cur, setCur] = useState(defaultCurrency());
  const [payer, setPayer] = useState('me'), [date, setDate] = useState(today());
  const [cat, setCat] = useState('general'), [catTouched, setCatTouched] = useState(false), [notes, setNotes] = useState('');
  const [split, setSplit] = useState<SplitState>(() => initialSplit(people));
  const [hint, setHint] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const total = toMinor(amt, cur);
  const result = computeFor(split, people, total, cur);
  const payerName = people.find(x => x.id === payer)!.name;

  async function submit(){
    const description = desc.trim();
    if (!description) return setHint('Say what the expense was for.');
    if (result.error) return setHint(null);
    const base = {kind: 'expense', description, split_mode: 'exact', split_input: {}, category: cat, date: date || today(),
      currency: cur, notes: notes.trim(), bill: {total, people: people.map(p => p.id === 'me' ? myName() : p.name)}};
    const rows: Record<string, unknown>[] = [];
    if (payer === 'me') {
      for (const f of friends) { const s = result.split![f.key] || 0; if (s > 0) rows.push({...base, group_id: f.gid, amount: s, paid_by: f.mymid, split: {[f.fmid]: s}}); }
    } else {
      const f = friends.find(x => x.key === payer)!, s = result.split!.me || 0;
      if (s > 0) rows.push({...base, group_id: f.gid, amount: s, paid_by: f.fmid, split: {[f.mymid]: s}});
    }
    if (!rows.length) return setHint('Nobody owes anyone anything with this split.');
    setHint(null); setBusy(true);
    const ok = await run(sb.from('expenses').insert(rows), `Added to ${rows.length} ${rows.length === 1 ? 'friend' : 'friends'}`);
    setBusy(false);
    if (ok) router.back();
  }

  return (
    <KeyboardAvoidingView style={{flex: 1, backgroundColor: c.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormBar title={`Add expense with ${friends.length} friends`} onClose={() => router.back()} onSave={submit} busy={busy} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 16, gap: 14, maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: 40}}>
        <Field label="What was it for?" value={desc} autoFocus maxLength={80} placeholder="Dinner"
          onChangeText={v => { setDesc(v); if (!catTouched) { const k = guessCategory(v); if (k) setCat(k); } }} />
        <View style={{flexDirection: 'row', gap: 12}}>
          <View style={{flex: 1}}><Field label="Amount" value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="0.00" /></View>
          <Select label="Currency" value={cur} options={CURRENCY_OPTIONS} search onChange={setCur} style={{flex: 1}} />
        </View>
        <View style={{flexDirection: 'row', gap: 12, alignItems: 'flex-end'}}>
          <Select label="Paid by" value={payer} options={people.map(p => ({value: p.id, label: p.name}))} onChange={setPayer} style={{flex: 1}} />
          <DateTool value={date} onChange={setDate} label={dayLabel(date)} />
        </View>
        <SplitEditor people={people} st={split} set={setSplit} result={result} cur={cur} />
        {payer !== 'me' && <Txt small muted>Only your share is recorded with {payerName}. What the others owe them stays between them: use a group if you want to track that too.</Txt>}
        <Select label="Category" value={cat} options={CATEGORY_OPTIONS} onChange={v => { setCat(v); setCatTouched(true); }} />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={1000} style={{minHeight: 64, textAlignVertical: 'top', paddingTop: 10}} />
        {!!hint && <Txt small color={c.owe}>{hint}</Txt>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
