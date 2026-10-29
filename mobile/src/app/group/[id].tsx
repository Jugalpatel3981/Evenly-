// A group, or the one-to-one ledger with a friend: balance summary, then Expenses, Balances, Totals or Whiteboard.
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, TextInput, View } from 'react-native';

import { canRemind, exportGroupCsv, run, sendReminder, summaryText } from '@/lib/actions';
import { CATEGORY_GROUPS, catOf } from '@/lib/categories';
import { curOf, pairwise, payersOf, simplify, type Map } from '@/lib/money';
import { avatarUrl, expOf, friendOf, friendsIndex, groupBalances, membersOf, myBalance, myId, nameOf, personName, S, titleOf, uid,
  useStore, type Group } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { ago, fmt } from '@/lib/util';
import { GroupLines, groupLineData, PersonLines } from '@/ui/balances';
import { Bar, MonthBars } from '@/ui/charts';
import { Chip } from '@/ui/controls';
import { ExpenseLine } from '@/ui/expense-row';
import { Icon } from '@/ui/icons';
import { Avatar, Button, Card, Empty, Fab, GroupAvatar, H2, IconButton, Label, LinkText, Screen, Title, Txt } from '@/ui/kit';
import { usePullToRefresh } from '@/ui/refresh';
import { useTheme } from '@/ui/theme';
import { toast } from '@/ui/toast';

type Tab = 'expenses' | 'balances' | 'insights' | 'board';
const APP_URL = 'https://evenly-tracker.netlify.app/';

// The coloured band at the top, with back and settings buttons.
export function Banner({g, back, onSettings}: {g?: Group | null; back: string; onSettings?: () => void}){
  const {c} = useTheme();
  const tint = !g ? c.accent : {trip: c.cat.transport, home: c.cat.home, couple: c.cat.life}[g.type || ''] || c.accent;
  return (
    <View style={{height: 124, marginHorizontal: -16, marginTop: -8, backgroundColor: tint, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 8}}>
      <IconButton icon="chevron-left" label={`Back to ${back}`} color="#fff" size={24} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
      {onSettings && <IconButton icon="settings" label="Settings" color="#fff" onPress={onSettings} />}
    </View>
  );
}

export default function GroupPage(){
  const S_ = useStore();
  const {id} = useLocalSearchParams<{id: string}>();
  const g = S_.groups[id];
  const [tab, setTab] = useState<Tab>('expenses');
  const refresh = usePullToRefresh();
  const {c} = useTheme();
  if (!g) return <Screen><Banner back="groups" /><Empty title="Not found" text="This group isn’t available any more." /></Screen>;
  const me = myId(g.id);
  const f = g.is_direct ? friendOf(g.id) : null;
  const valid: Tab[] = g.is_direct ? ['expenses', 'insights'] : ['expenses', 'balances', 'insights', 'board'];
  const t = valid.includes(tab) ? tab : 'expenses';
  const mine = myBalance(g.id);
  const hasExp = expOf(g.id).length > 0;

  // What we owe each other: the friend's line (plus any shared groups), or one line per member of the group.
  let lines: React.ReactNode = null;
  if (g.is_direct) {
    const fi = f ? friendsIndex().get(f.user_id ? 'u:' + f.user_id : f.email ? 'e:' + f.email.toLowerCase() : 'd:' + g.id) : null;
    const others = (fi?.groups || []).filter(x => Object.values(x.amt).some(v => v));
    if (Object.values(mine).some(v => v) || others.length) lines = <>
      <PersonLines name={titleOf(g)} amt={mine} big />
      {others.map(x => <PersonLines key={x.gid} big name={titleOf(g)} amt={x.amt} where={`in ${S.groups[x.gid].name}`} />)}
    </>;
  } else if (groupLineData(g).length) lines = <GroupLines g={g} max={4} big />;
  if (!lines) lines = <Txt muted style={{fontSize: 16}}>{hasExp ? 'You’re all settled up.' : 'No expenses yet.'}</Txt>;

  return (
    <View style={{flex: 1}}>
      <Screen refresh={refresh} top={false}>
        <Banner g={g.is_direct ? null : g} back={g.is_direct ? 'friends' : 'groups'}
          onSettings={() => router.push({pathname: g.is_direct ? '/friend-form' : '/group-form', params: {gid: g.id}})} />
        <View style={{marginTop: -64, gap: 6}}>
          <View style={{borderWidth: 4, borderColor: c.bg, backgroundColor: c.bg, borderRadius: g.is_direct ? 50 : 22, alignSelf: 'flex-start'}}>
            {g.is_direct ? <Avatar name={personName(f)} url={avatarUrl(f)} size={84} /> : <GroupAvatar type={g.type} cover={g.cover_url} size={84} />}
          </View>
          <Title style={{fontSize: 28, lineHeight: 34}}>{titleOf(g)}</Title>
          {g.is_direct && f && !f.user_id && <Txt small muted>{f.email ? `Invited · ${f.email}` : 'Not on Evenly yet'}</Txt>}
          <View style={{gap: 2}}>{lines}</View>
        </View>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
          <Chip primary title="Settle up" onPress={() => router.push({pathname: '/settle', params: {gid: g.id}})} />
          {g.is_direct && f && canRemind(g.id, f.id) && Object.entries(mine).filter(([, v]) => v > 0).map(([cur, v]) =>
            <Chip key={cur} icon="bell" title="Remind" onPress={() => sendReminder(g.id, f.id, v, cur)} />)}
          {!g.is_direct && <Chip title="Balances" on={t === 'balances'} onPress={() => setTab('balances')} />}
          <Chip title="Totals" on={t === 'insights'} onPress={() => setTab('insights')} />
          {!g.is_direct && <Chip title="Whiteboard" on={t === 'board'} onPress={() => setTab('board')} />}
          {(!g.is_direct || (f && !f.user_id)) && <Chip icon="share-2" title="Invite" onPress={() => router.push({pathname: '/invite', params: {gid: g.id}})} />}
          {hasExp && <Chip icon="copy" title="Export" onPress={() => exportGroupCsv(g.id)} />}
        </View>
        {g.is_direct && f && !f.user_id && (
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.accent + '1a', borderRadius: 14, padding: 12, flexWrap: 'wrap'}}>
            <Icon name="user-plus" size={18} color={c.accent} />
            <Txt small style={{flex: 1, minWidth: 180}}>{personName(f)} won’t see these expenses or get notifications until they join. Send them an invite link.</Txt>
            <Button small kind="primary" icon="share-2" title="Invite" onPress={() => router.push({pathname: '/invite', params: {gid: g.id}})} />
          </View>)}
        {t !== 'expenses' && <LinkText small title="‹ Back to expenses" onPress={() => setTab('expenses')} />}
        {t === 'expenses' ? <Expenses g={g} me={me} /> : t === 'balances' ? <Balances g={g} /> : t === 'insights' ? <Insights g={g} /> : <Board g={g} />}
      </Screen>
      <Fab onPress={() => router.push({pathname: '/expense-form', params: {gid: g.id}})} />
    </View>
  );
}

function Expenses({g, me}: {g: Group; me: string | null}){
  const {c} = useTheme();
  const exps = expOf(g.id);
  const deleted = S.activity.filter(a => a.group_id === g.id && a.kind === 'expense_deleted' && !S.expenses[a.expense_id || '']).length;
  const trash = deleted ? <LinkText small title={`Recently deleted (${deleted})`} onPress={() => router.push({pathname: '/deleted', params: {gid: g.id}})} /> : null;
  if (!exps.length) return <Empty title="No expenses yet" text={`Add the first bill: who paid, how much, and who it was for.${g.is_direct ? '' : ' Everyone in the group sees it straight away.'}`}
    action={<View style={{gap: 12, alignItems: 'center'}}><Button kind="primary" icon="receipt" title="Add an expense" onPress={() => router.push({pathname: '/expense-form', params: {gid: g.id}})} />{trash}</View>} />;
  const out: React.ReactNode[] = []; let last = '';
  for (const e of exps) {
    const month = new Date(e.date + 'T00:00').toLocaleDateString(undefined, {month: 'long', year: 'numeric'});
    if (month !== last) {
      out.push(<View key={'m' + month} style={{backgroundColor: c.chip, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, marginHorizontal: -16}}>
        <Label>{month}</Label></View>);
      last = month;
    }
    out.push(<ExpenseLine key={e.id} g={g} e={e} me={me} />);
  }
  return <View>{out}{trash && <View style={{paddingVertical: 12}}>{trash}</View>}</View>;
}

function Balances({g}: {g: Group}){
  const {c} = useTheme();
  const all = groupBalances(g.id), me = myId(g.id);
  const curs = Object.keys(all).filter(cur => Object.values(all[cur]).some(v => v));
  if (!curs.length) return <Empty title="All settled up" text="Nobody owes anything in this group right now." />;
  const pw = g.simplify ? null : pairwise(expOf(g.id), g);
  const transfers: Record<string, {from: string; to: string; amount: number}[]> = {};
  for (const [cur, b] of Object.entries(all)) transfers[cur] = g.simplify ? simplify(b) : (pw![cur] || []);
  const copy = async () => {
    const text = summaryText(g, transfers, Platform.OS === 'web' ? window.location.origin + '/' : APP_URL);
    await Clipboard.setStringAsync(text); toast('Copied');
  };
  return (
    <View style={{gap: 18}}>
      {curs.map(cur => {
        const bal = all[cur], tx = transfers[cur];
        return (
          <View key={cur} style={{gap: 8}}>
            <Label>{curs.length > 1 ? `${cur} · ` : ''}Balances</Label>
            <Card pad={false}>
              {membersOf(g.id).map((m, i) => {
                const b = bal[m.id] || 0, who = m.id === me ? 'You' : personName(m), isMe = m.id === me;
                const lines = tx.filter(x => x.from === m.id || x.to === m.id);
                return (
                  <View key={m.id} style={{flexDirection: 'row', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, alignItems: 'flex-start'}}>
                    <Avatar name={personName(m)} url={avatarUrl(m)} size={40} />
                    <View style={{flex: 1, gap: 8}}>
                      <Txt>{b > 0 ? <>{who} {isMe ? 'get back' : 'gets back'} <Txt weight="bold" color={c.owed}>{fmt(b, cur)}</Txt> in total</>
                        : b < 0 ? <>{who} {isMe ? 'owe' : 'owes'} <Txt weight="bold" color={c.owe}>{fmt(b, cur)}</Txt> in total</>
                        : `${who} ${isMe ? 'are' : 'is'} settled up`}</Txt>
                      {lines.length > 0 && (
                        <View style={{borderLeftWidth: 2, borderLeftColor: c.line, marginLeft: 6, paddingLeft: 12, gap: 8}}>
                          {lines.map((x, j) => (
                            <View key={j} style={{flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                              <Txt small style={{flex: 1, minWidth: 160}}>{nameOf(g.id, x.from)} {x.from === me ? 'owe' : 'owes'} {nameOf(g.id, x.to) === 'You' ? 'you' : nameOf(g.id, x.to)} <Txt small weight="bold" color={x.from === m.id ? c.owe : c.owed}>{fmt(x.amount, cur)}</Txt></Txt>
                              {x.from === m.id && x.to === me && canRemind(g.id, x.from) && <Button small kind="ghost" icon="bell" title="Remind"
                                onPress={() => sendReminder(g.id, x.from, x.amount, cur)} />}
                              {x.from === m.id && <Button small title="Settle up"
                                onPress={() => router.push({pathname: '/settle', params: {gid: g.id, from: x.from, to: x.to, amt: String(x.amount), cur}})} />}
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        );
      })}
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap'}}>
        <Button small icon="copy" title="Copy for group chat" onPress={copy} />
        <Txt small muted style={{flex: 1, minWidth: 180}}>{g.simplify ? 'Debts are simplified. Change this in group settings.' : 'Debts are not simplified. Change this in group settings.'}</Txt>
      </View>
    </View>
  );
}

function Stat({label, value}: {label: string; value: string}){
  return <Card style={{flex: 1, minWidth: 150, gap: 4, padding: 14}}><Txt small muted weight="semi">{label}</Txt><Txt weight="bold" style={{fontSize: 20, lineHeight: 26}}>{value}</Txt></Card>;
}
function Insights({g}: {g: Group}){
  const {c} = useTheme();
  const real = expOf(g.id).filter(e => e.kind !== 'payment');
  if (!real.length) return <Empty title="Nothing to total yet" text="Spending by category and by person shows up here once you add expenses." />;
  const me = myId(g.id);
  const byCur: Record<string, typeof real> = {}; real.forEach(e => (byCur[curOf(e, g)] ||= []).push(e));
  return <View style={{gap: 22}}>{Object.entries(byCur).map(([cur, list]) => {
    const total = list.reduce((a, e) => a + Number(e.amount), 0);
    const myShare = list.reduce((a, e) => a + Number(e.split?.[me || ''] || 0), 0);
    const myPaid = list.reduce((a, e) => a + Number(payersOf(e)[me || ''] || 0), 0);
    const byParent: Record<string, {label: string; color: string; icon: string; v: number}> = {};
    list.forEach(e => { const k = catOf(e.category); (byParent[k.parent] ||= {label: k.parentLabel, color: k.color, icon: CATEGORY_GROUPS.find(x => x.key === k.parent)!.items[0][2], v: 0}).v += Number(e.amount); });
    const cats = Object.values(byParent).sort((a, b) => b.v - a.v), cmax = cats[0].v;
    const paid: Map = {}, share: Map = {};
    list.forEach(e => { for (const [k, v] of Object.entries(payersOf(e))) paid[k] = (paid[k] || 0) + Number(v); for (const [k, v] of Object.entries(e.split)) share[k] = (share[k] || 0) + Number(v); });
    return (
      <View key={cur} style={{gap: 18}}>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
          <Stat label={`Total ${g.is_direct ? 'spent together' : 'group spending'}`} value={fmt(total, cur)} />
          {me && <Stat label="Total you paid for" value={fmt(myPaid, cur)} />}
          {me && <Stat label="Your total share" value={fmt(myShare, cur)} />}
        </View>
        <View style={{gap: 8}}><Label>Month by month</Label>
          <MonthBars list={list} cur={cur} total={e => Number(e.amount)} mine={me ? e => Number(e.split?.[me] || 0) : null} /></View>
        <View style={{gap: 8}}><Label>Spending by category</Label>
          <Card pad={false}>{cats.map((k, i) => (
            <View key={k.label} style={{flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line}}>
              <View style={{width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.cat[k.color] + '22'}}>
                <Icon name={k.icon} size={20} color={c.cat[k.color]} /></View>
              <View style={{flex: 1, gap: 6}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', gap: 8}}>
                  <Txt weight="bold">{k.label}</Txt><Txt>{fmt(k.v, cur)} <Txt muted>· {Math.round(k.v / total * 100)}%</Txt></Txt></View>
                <Bar pct={k.v / cmax * 100} color={c.cat[k.color]} />
              </View>
            </View>))}</Card></View>
        <View style={{gap: 8}}><Label>Paid versus share</Label>
          <Card pad={false}>{membersOf(g.id).map((m, i) => (
            <View key={m.id} style={{flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line}}>
              <Avatar name={personName(m)} url={avatarUrl(m)} size={40} />
              <View style={{flex: 1}}><Txt weight="semi">{nameOf(g.id, m.id)}</Txt>
                <Txt small muted>paid {fmt(paid[m.id] || 0, cur)} · share {fmt(share[m.id] || 0, cur)}</Txt></View>
            </View>))}</Card></View>
      </View>
    );
  })}</View>;
}

function Board({g}: {g: Group}){
  const {c} = useTheme();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const by = g.whiteboard_by ? (g.whiteboard_by === uid() ? 'you' : (membersOf(g.id).find(m => m.user_id === g.whiteboard_by)?.name || 'someone')) : null;
  const save = async () => { setBusy(true); const ok = await run(sb.from('groups').update({whiteboard: text ?? g.whiteboard ?? ''}).eq('id', g.id), 'Whiteboard saved'); setBusy(false); if (ok) setText(null); };
  return (
    <View style={{gap: 10}}>
      <H2>Group whiteboard</H2>
      <Txt small muted>Shared notes for everyone in the group: Wi-Fi password, trip plan, house rules.</Txt>
      <TextInput value={text ?? g.whiteboard ?? ''} onChangeText={setText} multiline maxLength={5000} placeholder="Write anything the group should know…"
        placeholderTextColor={c.muted} accessibilityLabel="Group whiteboard"
        style={{minHeight: 220, textAlignVertical: 'top', fontFamily: 'InstrumentSans_400Regular', fontSize: 16, color: c.ink, backgroundColor: c.surface,
          borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 14}} />
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
        <Txt small muted style={{flex: 1}}>{by ? `Last edited by ${by}, ${ago(g.whiteboard_at!)}` : 'Nobody has written here yet.'}</Txt>
        <Button kind="primary" small title="Save" onPress={save} busy={busy} />
      </View>
    </View>
  );
}
