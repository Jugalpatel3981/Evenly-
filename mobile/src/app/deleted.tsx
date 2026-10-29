// Recently deleted expenses in a group, each with a Restore button.
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { restoreExpense, whoDid } from '@/lib/actions';
import { curOf } from '@/lib/money';
import { S, useStore } from '@/lib/store';
import { ago, fmt } from '@/lib/util';
import { FormBar } from '@/ui/controls';
import { Button, CatIcon, Row, Txt } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function Deleted(){
  useStore();
  const {c} = useTheme();
  const {gid} = useLocalSearchParams<{gid: string}>();
  const g = S.groups[gid];
  const list = g ? S.activity.filter(a => a.group_id === gid && a.kind === 'expense_deleted' && !S.expenses[a.expense_id || '']) : [];
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <FormBar title="Recently deleted" onClose={() => router.back()} />
      <ScrollView contentContainerStyle={{padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center'}}>
        <Txt small muted>Bring back anything deleted by mistake. Balances update as soon as it’s restored.</Txt>
        {list.length ? list.map(a => {
          const e = a.data.old;
          return (
            <Row key={a.id}>
              {e.kind === 'payment' ? <CatIcon icon="arrow-left-right" color={c.accent} /> : <CatIcon cat={e.category} />}
              <View style={{flex: 1}}>
                <Txt weight="semi">{e.kind === 'payment' ? 'Payment' : e.description}</Txt>
                <Txt small muted>{fmt(Number(e.amount), curOf(e, g))} · deleted by {whoDid(gid, a.actor)} {ago(a.created_at)}</Txt>
              </View>
              <Button small icon="rotate-ccw" title="Restore" onPress={async () => { if (await restoreExpense(a.id)) router.back(); }} />
            </Row>
          );
        }) : <Txt muted>Nothing to restore.</Txt>}
      </ScrollView>
    </View>
  );
}
