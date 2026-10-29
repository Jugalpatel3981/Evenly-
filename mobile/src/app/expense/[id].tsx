// Expense details: who paid and who owes, notes, a three-month category chart, and one thread of comments and changes.
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import { changes, REPEATS, run, whoDid } from '@/lib/actions';
import { catOf, GROUP_TYPES } from '@/lib/categories';
import { curOf, payersOf } from '@/lib/money';
import { avatarUrl, expOf, friendly, member, myId, myName, nameOf, personName, S, titleOf, uid, useStore, type ExpenseRow, type Group } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { ago, fmt, niceDate } from '@/lib/util';
import { Bar } from '@/ui/charts';
import { ConfirmIcon, FormBar } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { Avatar, CatIcon, IconButton, Label, Txt } from '@/ui/kit';
import { F, useTheme } from '@/ui/theme';

type Item = {at: string; kind: 'comment' | 'event'; id: string; who: string; userId?: string | null; text: string; icon?: string};

export default function ExpenseDetail(){
  useStore();
  const {id} = useLocalSearchParams<{id: string}>();
  const e = S.expenses[id];
  if (!e || !S.groups[e.group_id]) return (
    <View style={{flex: 1}}><FormBar title="Details" closeIcon="chevron-left" onClose={() => router.back()} />
      <View style={{padding: 24}}><Txt muted>This expense has been deleted.</Txt></View></View>
  );
  return <Detail e={e} g={S.groups[e.group_id]} />;
}

function Detail({e, g}: {e: ExpenseRow; g: Group}){
  const {c} = useTheme();
  const cur = curOf(e, g), me = myId(g.id), isPay = e.kind === 'payment', payers = payersOf(e);
  const hist = S.activity.filter(a => a.expense_id === e.id);
  const created = hist.find(a => a.kind === 'expense_added' || a.kind === 'expense_recurring');
  const updated = hist.find(a => a.kind === 'expense_updated');
  const who = (mid: string) => nameOf(g.id, mid);
  const av = (mid: string) => <Avatar name={personName(member(g.id, mid))} url={avatarUrl(member(g.id, mid))} size={30} />;

  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  // Comments and every change to the expense, in one thread, oldest first.
  const fetchThread = useCallback(async (): Promise<{items?: Item[]; error?: string}> => {
    const [cm, h] = await Promise.all([
      sb.from('comments').select('*').eq('expense_id', e.id).order('created_at'),
      sb.from('activity').select('*').eq('expense_id', e.id).order('created_at'),
    ]);
    if (cm.error || h.error) return {error: friendly(cm.error || h.error)};
    return {items: [
      ...cm.data.map((x: any) => ({at: x.created_at, kind: 'comment' as const, id: x.id, who: whoDid(g.id, x.user_id), userId: x.user_id, text: x.body})),
      ...h.data.filter((a: any) => a.kind !== 'comment').map((a: any) => {
        const w = whoDid(g.id, a.actor);
        const text = a.kind === 'expense_added' ? `${w} added this ${isPay ? 'payment' : 'expense'}`
          : a.kind === 'expense_recurring' ? 'Added automatically by a repeating expense'
          : a.kind === 'expense_restored' ? `${w} restored this expense`
          : a.kind === 'expense_updated' ? `${w} changed ${changes(a, g.id)}`
          : `${w} deleted this expense`;
        return {at: a.created_at, kind: 'event' as const, id: 'a' + a.id, who: w, text,
          icon: a.kind === 'expense_updated' ? 'pencil' : a.kind === 'expense_restored' ? 'rotate-ccw' : 'receipt'};
      }),
    ].sort((x, y) => String(x.at).localeCompare(String(y.at)))};
  }, [e.id, g.id, isPay]);
  const apply = (r: {items?: Item[]; error?: string}) => { setErr(r.error || null); if (r.items) setItems(r.items); };
  const reload = () => fetchThread().then(apply);
  // Reload when the expense changes (an edit adds a line to the thread).
  useEffect(() => {
    let live = true;
    fetchThread().then(r => { if (live) apply(r); });
    return () => { live = false; };
  }, [fetchThread, e]);

  async function post(){
    const text = body.trim(); if (!text) return;
    setBusy(true);
    const ok = await run(sb.from('comments').insert({id: Crypto.randomUUID(), expense_id: e.id, group_id: g.id, body: text}));
    setBusy(false);
    if (ok) { setBody(''); reload(); }
  }
  async function delComment(cid: string){ if (await run(sb.from('comments').delete().eq('id', cid))) reload(); }
  async function remove(){ if (await run(sb.from('expenses').delete().eq('id', e.id), 'Deleted. You can restore it from Activity.')) router.back(); }
  const edit = () => router.push(isPay ? {pathname: '/settle', params: {gid: g.id, pid: e.id}} : {pathname: '/expense-form', params: {gid: g.id, eid: e.id}});

  const youLower = (s: string) => s.replace(/^You$/, 'you');
  const groupIcon = g.is_direct ? 'user' : GROUP_TYPES.find(t => t[0] === g.type)?.[2] || 'users';
  return (
    <KeyboardAvoidingView style={{flex: 1, backgroundColor: c.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormBar title="Details" closeIcon="chevron-left" onClose={() => router.back()}
        right={<View style={{flexDirection: 'row'}}><ConfirmIcon icon="trash" label="Delete" onConfirm={remove} /><IconButton icon="pencil" label="Edit" size={20} onPress={edit} /></View>} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 16, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: 32}}>
        <View style={{flexDirection: 'row', gap: 14, alignItems: 'flex-start'}}>
          {isPay ? <CatIcon icon="arrow-left-right" color={c.accent} size={56} /> : <CatIcon cat={e.category} size={56} />}
          <View style={{flex: 1, gap: 4}}>
            <Txt weight="semi" style={{fontSize: 18}}>{isPay ? 'Payment' : e.description}</Txt>
            <Txt style={{fontFamily: F.displayBlack, fontSize: 30, lineHeight: 36}}>{fmt(Number(e.amount), cur)}</Txt>
            <View style={{flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: c.line, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.surface}}>
              <Icon name={groupIcon} size={14} color={c.ink} /><Txt small weight="semi">{g.is_direct ? titleOf(g) : g.name}</Txt></View>
            <Txt small muted>{niceDate(e.date)}</Txt>
            {created && <Txt small muted>Added by {youLower(whoDid(g.id, created.actor))} on {niceDate(created.created_at.slice(0, 10))}</Txt>}
            {updated && <Txt small muted>Last updated by {youLower(whoDid(g.id, updated.actor))} on {niceDate(updated.created_at.slice(0, 10))}</Txt>}
          </View>
        </View>
        {!!e.repeat && e.repeat !== 'never' && (
          <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: c.accent + '1a', borderRadius: 12, padding: 12}}>
            <Icon name="repeat" size={15} color={c.accent} />
            <Txt small style={{flex: 1}}>Repeats {REPEATS.find(r => r[0] === e.repeat)![1].toLowerCase()}{e.next_date ? `. Next on ${niceDate(e.next_date)}.` : ''}</Txt>
          </View>)}
        {!!e.repeat_parent && <Txt small muted>Added automatically from a repeating expense.</Txt>}
        {!!e.bill && <Txt small muted>Part of a {fmt(Number(e.bill.total), cur)} bill with {(e.bill.people || []).join(', ')}.</Txt>}

        <View style={{gap: 10}}>
          {isPay ? <View style={{flexDirection: 'row', gap: 10, alignItems: 'center'}}>{av(e.paid_by)}<Txt weight="bold">{who(e.paid_by)} paid {who(Object.keys(e.split)[0])} {fmt(Number(e.amount), cur)}</Txt></View>
          : <>
            {Object.entries(payers).map(([pid, v]) => <View key={pid} style={{flexDirection: 'row', gap: 10, alignItems: 'center'}}>{av(pid)}<Txt weight="bold">{who(pid)} paid {fmt(Number(v), cur)}</Txt></View>)}
            <View style={{borderLeftWidth: 2, borderLeftColor: c.line, marginLeft: 14, paddingLeft: 14, gap: 8}}>
              {Object.entries(e.split).map(([sid, v]) => <View key={sid} style={{flexDirection: 'row', gap: 10, alignItems: 'center'}}>{av(sid)}
                <Txt>{who(sid)} {sid === me ? 'owe' : 'owes'} {fmt(Number(v), cur)}</Txt></View>)}
            </View>
          </>}
        </View>
        {!!e.notes && <View style={{backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12}}><Txt selectable>{e.notes}</Txt></View>}
        {!isPay && <CategoryChart g={g} e={e} cur={cur} />}

        <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}><Icon name="message-square" size={14} color={c.muted} /><Label>Comments</Label></View>
        <View style={{gap: 10}}>
          {err ? <Txt small color={c.owe}>{err}</Txt> : !items ? <Txt small muted>Loading…</Txt> : !items.length ? <Txt small muted>No comments yet.</Txt>
          : items.map(it => it.kind === 'event' ? (
            <View key={it.id} style={{flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingHorizontal: 4}}>
              <View style={{paddingTop: 3}}><Icon name={it.icon!} size={13} color={c.muted} /></View>
              <Txt small style={{flex: 1}}><Txt small weight="bold">{it.text.startsWith(it.who) ? it.who : ''}</Txt>{it.text.startsWith(it.who) ? it.text.slice(it.who.length) : it.text} <Txt small muted>· {ago(it.at)}</Txt></Txt>
            </View>) : (
            <View key={it.id} style={{flexDirection: it.userId === uid() ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end'}}>
              <Avatar name={it.userId === uid() ? myName() : it.who} url={S.profiles[it.userId || '']?.avatar_url} size={30} />
              <View style={{maxWidth: '78%', backgroundColor: it.userId === uid() ? c.accent + '22' : c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 10, gap: 2}}>
                <Txt small muted><Txt small weight="bold">{it.who}</Txt> · {ago(it.at)}</Txt>
                <Txt selectable>{it.text}</Txt>
              </View>
              {it.userId === uid() && <Pressable onPress={() => delComment(it.id)} accessibilityRole="button" accessibilityLabel="Delete comment" hitSlop={8} style={{padding: 4}}>
                <Icon name="x" size={15} color={c.muted} /></Pressable>}
            </View>))}
        </View>
      </ScrollView>
      <View style={{flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface}}>
        <View style={{flex: 1, flexDirection: 'row', gap: 8, maxWidth: 720, width: '100%', alignSelf: 'center', marginHorizontal: 'auto'}}>
          <TextInput value={body} onChangeText={setBody} placeholder="Add a comment" placeholderTextColor={c.muted} maxLength={1000} accessibilityLabel="Add a comment"
            onSubmitEditing={post} returnKeyType="send"
            style={{flex: 1, fontFamily: F.body, fontSize: 16, color: c.ink, backgroundColor: c.field, borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingHorizontal: 14, minHeight: 46}} />
          <Pressable onPress={post} disabled={busy} accessibilityRole="button" accessibilityLabel="Post"
            style={({pressed}) => ({width: 46, height: 46, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed || busy ? 0.7 : 1})}>
            <Icon name="send" size={18} color={c.accentInk} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// Spending in this expense's category in this group, for the three months up to it.
function CategoryChart({g, e, cur}: {g: Group; e: ExpenseRow; cur: string}){
  const {c} = useTheme();
  const k = catOf(e.category), end = new Date(e.date + 'T00:00');
  const months = [2, 1, 0].map(n => { const d = new Date(end.getFullYear(), end.getMonth() - n, 1);
    return {key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString(undefined, {month: 'long'}), v: 0}; });
  expOf(g.id).forEach(x => { if (x.kind === 'payment' || catOf(x.category).key !== k.key || curOf(x, g) !== cur) return;
    const m = months.find(mm => mm.key === x.date.slice(0, 7)); if (m) m.v += Number(x.amount); });
  const max = Math.max(1, ...months.map(m => m.v));
  return (
    <View style={{gap: 8}}>
      <Label>Spending by category</Label>
      <Txt small muted>{g.is_direct ? titleOf(g) : g.name} :: {k.label}</Txt>
      {months.map(m => (
        <View key={m.key} style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <Txt small style={{width: 90}}>{m.label}</Txt>
          <View style={{flex: 1}}><Bar pct={m.v / max * 100} color={c.cat[k.color]} /></View>
          <Txt small style={{minWidth: 80, textAlign: 'right'}}>{fmt(m.v, cur)}</Txt>
        </View>
      ))}
    </View>
  );
}
