// Add or edit an expense in a group or friend ledger. Full-screen, like the website: description and amount up top,
// a "Paid by you and split equally" button that opens the details, and a toolbar for date, repeat and notes.
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import { MODE_WORDS, REPEATS, run } from '@/lib/actions';
import { guessCategory, GROUP_TYPES } from '@/lib/categories';
import { computePayers, curOf } from '@/lib/money';
import { choosePhoto, stampedPath, upload, type Photo } from '@/lib/photos';
import { rates, toCurrency } from '@/lib/rates';
import { avatarUrl, friendly, friendOf, membersOf, myId, nameOf, S, save, titleOf, useStore } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { curSymbol, fmt, fromMinor, today, toMinor } from '@/lib/util';
import { ConfirmButton, FormBar, Select, SwitchRow, Tool } from '@/ui/controls';
import { DateTool } from '@/ui/date-picker';
import { CATEGORY_OPTIONS, CURRENCY_OPTIONS, dayLabel } from '@/ui/options';
import { Icon } from '@/ui/icons';
import { Avatar, Button, CatIcon, Field, LineInput, LinkText, noOutline, Txt } from '@/ui/kit';
import { toast } from '@/ui/toast';
import { computeFor, initialSplit, SplitEditor, splitInput, type SplitState } from '@/ui/split-editor';
import { F, useTheme } from '@/ui/theme';

export default function ExpenseForm(){
  useStore();
  const {gid, eid} = useLocalSearchParams<{gid: string; eid?: string}>();
  const g = S.groups[gid];
  if (!g) return null;
  return <Form key={eid || 'new'} gid={gid} eid={eid} />;
}

function Form({gid, eid}: {gid: string; eid?: string}){
  const {c} = useTheme();
  const g = S.groups[gid], e = eid ? S.expenses[eid] : null, members = membersOf(gid);
  const people = useMemo(() => members.map(m => ({id: m.id, name: nameOf(gid, m.id)})), [gid, members]);
  const ids = people.map(p => p.id);
  const multi0 = !!(e?.payers && Object.keys(e.payers).length > 1);
  const cur0 = e ? curOf(e, g) : g.currency;
  // A new expense starts with the group's saved default split, if it has one.
  const ds = !e && g.default_split?.mode ? g.default_split : null;
  const mode0 = e?.split_mode || ds?.mode || 'equal';

  const [desc, setDesc] = useState(e?.description || '');
  const [amt, setAmt] = useState(e ? fromMinor(Number(e.amount), cur0) : '');
  const [cur, setCur] = useState(cur0);
  const [cat, setCat] = useState(e?.category || 'general');
  const [catTouched, setCatTouched] = useState(!!e);
  const [paid, setPaid] = useState(multi0 ? '__multi' : (e?.paid_by || myId(gid) || members[0].id));
  const [payInputs, setPayInputs] = useState<Record<string, string>>(multi0 ? Object.fromEntries(Object.entries(e!.payers!).map(([k, v]) => [k, fromMinor(Number(v), cur0)])) : {});
  const [split, setSplit] = useState<SplitState>(() => initialSplit(people, mode0,
    e && (mode0 === 'equal' || mode0 === 'adjust') ? Object.keys(e.split) : ds?.inc,
    e && mode0 !== 'equal' ? e.split_input : ds && ds.mode !== 'equal' ? ds.input : null));
  const [useDefault, setUseDefault] = useState(!!ds);
  const [defaultTouched, setDefaultTouched] = useState(false);
  const [panel, setPanel] = useState(false);
  const [date, setDate] = useState(e?.date || today());
  const [repeat, setRepeat] = useState(e?.repeat || 'never');
  const [notes, setNotes] = useState(e?.notes || '');
  const [notesOpen, setNotesOpen] = useState(!!e?.notes);
  const [receipt, setReceipt] = useState<{photo: Photo | null; removed: boolean}>({photo: null, removed: false});
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const total = toMinor(amt, cur);
  const result = computeFor(split, people, total, cur);
  const payRes = paid === '__multi' ? computePayers(total, ids, payInputs, cur, s => toMinor(s, cur)) : {payers: undefined};
  const who = paid === '__multi' ? 'several people' : paid === myId(gid) ? 'you' : nameOf(gid, paid);
  const n = result.split ? Object.keys(result.split).length : 0;
  const perPerson = split.mode === 'equal' && n && total > 0 ? `(${fmt(Math.floor(total / n), cur)}/person)`
    : split.mode === 'items' && result.total && !(total > 0) ? `(${fmt(result.total, cur)} from the items)` : '';

  // An expense in another currency: show it in the group's currency, with a button to convert it.
  const conv = cur !== g.currency && total > 0 ? toCurrency(total, cur, g.currency) : null;
  const onDesc = (v: string) => { setDesc(v); if (!catTouched) { const k = guessCategory(v); if (k) setCat(k); } };

  async function submit(){
    const description = desc.trim();
    if (!description) return setHint('Enter a description.');
    let t = total, r = result;
    // Split by items with no total typed: the items' sum is the total.
    if (!(t > 0) && split.mode === 'items' && result.total) { t = result.total; setAmt(fromMinor(t, cur)); r = computeFor(split, people, t, cur); }
    if (!(t > 0)) return setHint('Enter an amount above zero.');
    setHint(null);
    if (r.error) return setPanel(true);
    const p = paid === '__multi' ? computePayers(t, ids, payInputs, cur, s => toMinor(s, cur)) : {payers: undefined, error: undefined};
    if (p.error) return setPanel(true);
    const payers = p.payers;
    const paid_by = payers ? Object.entries(payers).sort((a, b) => b[1] - a[1])[0][0] : paid;
    const row = {group_id: g.id, kind: 'expense', description, amount: t, paid_by, payers: payers && Object.keys(payers).length > 1 ? payers : null,
      split: r.split, split_mode: split.mode, split_input: splitInput(split), category: cat, date: date || today(),
      currency: cur, notes: notes.trim(), repeat};
    setBusy(true);
    const id = e ? e.id : Crypto.randomUUID();
    const full: Record<string, unknown> = {...row};
    if (receipt.photo) {
      try { full.receipt_path = await upload('receipts', stampedPath(`${g.id}/${id}`), receipt.photo); }
      catch (err) { setBusy(false); toast(friendly(err)); return; }
    } else if (receipt.removed) full.receipt_path = null;
    const ok = e ? await save('expenses', 'update', full, e.id, 'Expense updated')
                 : await save('expenses', 'insert', {...full, id}, id, 'Expense added');
    if (ok && e?.receipt_path && (receipt.photo || receipt.removed)) sb.storage.from('receipts').remove([e.receipt_path]);
    // Remember (or forget) this split as the group's default.
    const wantDefault = useDefault && split.mode !== 'items';
    if (ok && wantDefault) {
      const def = {mode: split.mode, input: splitInput(split), inc: split.inc};
      if (JSON.stringify(def) !== JSON.stringify(g.default_split)) run(sb.from('groups').update({default_split: def}).eq('id', g.id));
    } else if (ok && !wantDefault && g.default_split && defaultTouched) run(sb.from('groups').update({default_split: null}).eq('id', g.id));
    setBusy(false);
    if (ok) router.back();
  }
  async function remove(){
    if (await save('expenses', 'delete', null, e!.id, 'Expense deleted. You can restore it from Activity.')) router.back();
  }

  const square = {width: 56, height: 56, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: 'center' as const, justifyContent: 'center' as const};
  const groupIcon = GROUP_TYPES.find(t => t[0] === g.type)?.[2] || 'users';
  return (
    <KeyboardAvoidingView style={{flex: 1, backgroundColor: c.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormBar title={e ? 'Edit expense' : 'Add an expense'} onClose={() => router.back()} onSave={submit} busy={busy} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 16, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: 40}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.line}}>
          <Txt>With <Txt weight="bold">you</Txt> and:</Txt>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: c.line, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.surface}}>
            {g.is_direct ? <Avatar name={titleOf(g)} url={avatarUrl(friendOf(g.id))} size={22} /> : <Icon name={groupIcon} size={15} color={c.ink} />}
            <Txt weight="semi" small>{g.is_direct ? titleOf(g) : `All of ${g.name}`}</Txt>
          </View>
        </View>

        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
          <Select label="Category" value={cat} options={CATEGORY_OPTIONS} onChange={v => { setCat(v); setCatTouched(true); }}>
            {open => <Pressable onPress={open} style={square} accessibilityRole="button" accessibilityLabel="Category"><CatIcon cat={cat} size={42} /></Pressable>}
          </Select>
          <LineInput value={desc} onChangeText={onDesc} placeholder="Enter a description" maxLength={80} autoFocus={!e}
            accessibilityLabel="Description" style={{fontSize: 20}} />
        </View>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
          <Select label="Currency" value={cur} options={CURRENCY_OPTIONS} search onChange={setCur}>
            {open => <Pressable onPress={open} style={square} accessibilityRole="button" accessibilityLabel={`Currency: ${cur}`}>
              <Txt weight="bold" style={{fontSize: 20}}>{curSymbol(cur)}</Txt></Pressable>}
          </Select>
          <LineInput value={amt} onChangeText={setAmt} placeholder="0.00" keyboardType="decimal-pad"
            accessibilityLabel="Amount" style={{fontSize: 36, fontFamily: F.display}} />
        </View>

        {conv != null && (
          <Txt small muted>≈ {fmt(conv, g.currency)} at today’s rate · <LinkText small title={`Convert to ${g.currency}`} onPress={() => {
            setCur(g.currency); setAmt(fromMinor(conv, g.currency));
            toast(`Converted to ${g.currency} using ${rates()?.source || 'today’s'} rates`);
          }} /></Txt>)}
        <Pressable onPress={() => setPanel(!panel)} accessibilityRole="button" accessibilityState={{expanded: panel}}
          style={({pressed}) => ({alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22, borderWidth: 1, borderColor: c.line, backgroundColor: pressed ? c.hover : c.surface})}>
          <Txt>Paid by <Txt weight="bold" color={c.accent}>{who}</Txt> and split <Txt weight="bold" color={c.accent}>{MODE_WORDS[split.mode]}</Txt></Txt>
        </Pressable>
        {!!perPerson && <Txt small muted style={{textAlign: 'center', marginTop: -8}}>{perPerson}</Txt>}

        {panel && (
          <View style={{gap: 14, backgroundColor: c.chip, borderRadius: 18, padding: 14}}>
            <Select label="Paid by" value={paid} onChange={setPaid}
              options={[...people.map(p => ({value: p.id, label: p.name})), {value: '__multi', label: 'Several people…'}]} />
            {paid === '__multi' && (
              <View style={{gap: 8}}>
                <Txt weight="semi" small muted>How much each person paid</Txt>
                <View style={{backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 14}}>
                  {people.map(p => (
                    <View key={p.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12}}>
                      <Txt style={{flex: 1}}>{p.name}</Txt>
                      <TextInput value={payInputs[p.id] ?? ''} placeholder="0" placeholderTextColor={c.muted} keyboardType="decimal-pad" accessibilityLabel={`${p.name} paid`}
                        onChangeText={v => setPayInputs({...payInputs, [p.id]: v})}
                        style={[{fontFamily: F.medium, fontSize: 16, color: c.ink, borderWidth: 1, borderColor: c.line, borderRadius: 10, paddingHorizontal: 10, minHeight: 40, width: 100, textAlign: 'right'}, noOutline]} />
                      <Txt small muted style={{minWidth: 34}}>{cur}</Txt>
                    </View>
                  ))}
                </View>
                <Txt small color={payRes.error ? c.owe : c.owed}>{payRes.error || 'Payments match the total'}</Txt>
              </View>
            )}
            <SplitEditor people={people} st={split} set={setSplit} result={result} cur={cur} />
            <SwitchRow value={useDefault && split.mode !== 'items'} disabled={split.mode === 'items'} onChange={v => { setUseDefault(v); setDefaultTouched(true); }}
              title={`Use this split for new expenses ${g.is_direct ? `with ${titleOf(g)}` : `in ${g.name}`}`} />
            <Button small title="Done" onPress={() => setPanel(false)} style={{alignSelf: 'flex-end'}} />
          </View>
        )}

        {!!hint && <Txt small color={c.owe}>{hint}</Txt>}
        {notesOpen && <Field label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={1000} placeholder="What it covered, who booked it…"
          style={{minHeight: 80, textAlignVertical: 'top', paddingTop: 10}} autoFocus={!e?.notes} />}
        {(receipt.photo || receipt.removed || e?.receipt_path) && (
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <Icon name="paperclip" size={13} color={c.muted} />
            {receipt.photo ? <Txt small muted>A receipt photo will be attached when you save. <LinkText small title="Remove" onPress={() => setReceipt({photo: null, removed: false})} /></Txt>
              : receipt.removed ? <Txt small muted>The receipt will be removed when you save.</Txt>
              : <Txt small muted>A receipt is attached. <LinkText small title="Remove" onPress={() => setReceipt({photo: null, removed: true})} /></Txt>}
          </View>)}
        {e && <ConfirmButton title="Delete expense" onConfirm={remove} style={{alignSelf: 'flex-start'}} />}
      </ScrollView>
      <View style={{flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface, paddingHorizontal: 8, paddingVertical: 4}}>
        <View style={{flexDirection: 'row', alignItems: 'center', flex: 1, maxWidth: 720, alignSelf: 'center', marginHorizontal: 'auto'}}>
          <DateTool value={date} onChange={setDate} label={dayLabel(date)} />
          <Select label="Repeats" value={repeat} onChange={setRepeat} options={REPEATS.map(([k, l]) => ({value: k, label: l}))}>
            {open => <Tool icon="repeat" label={repeat === 'never' ? 'Once' : REPEATS.find(r => r[0] === repeat)![1]} onPress={open} accessibilityLabel="Repeats" />}
          </Select>
          <View style={{flex: 1}} />
          <Tool icon="camera" iconOnly accessibilityLabel="Receipt photo" onPress={async () => {
            try { const photo = await choosePhoto(1800, 'Receipt photo'); if (photo) setReceipt({photo, removed: false}); } catch (err) { toast(friendly(err)); }
          }} />
          <Tool icon="notebook-pen" iconOnly onPress={() => setNotesOpen(true)} accessibilityLabel="Notes" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
