// A monthly budget for one category group, across all your groups and friends.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { run } from '@/lib/actions';
import { CATEGORY_GROUPS } from '@/lib/categories';
import { defaultCurrency, myName, myProfile, uid, useStore } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { curSymbol, fromMinor, toMinor } from '@/lib/util';
import { FormBar } from '@/ui/controls';
import { Button, LineInput, Txt } from '@/ui/kit';
import { F, useTheme } from '@/ui/theme';

export default function Budget(){
  useStore();
  const {c} = useTheme();
  const {key} = useLocalSearchParams<{key: string}>();
  const cg = CATEGORY_GROUPS.find(x => x.key === key)!, cur = defaultCurrency();
  const budgets = {...(myProfile()?.budgets || {})}, now = budgets[key];
  const [amt, setAmt] = useState(now ? fromMinor(Number(now), cur) : '');
  const [hint, setHint] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const store = async (next: Record<string, number>) => {
    setBusy(true);
    const ok = await run(sb.from('profiles').upsert({id: uid(), name: myName(), budgets: next}, {onConflict: 'id'}), 'Budget saved');
    setBusy(false);
    if (ok) router.back();
  };
  const save = () => { const v = toMinor(amt, cur); if (!(v > 0)) return setHint('Enter a monthly amount above zero.'); store({...budgets, [key]: v}); };
  const remove = () => { const {[key]: _gone, ...rest} = budgets; store(rest); };
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <FormBar title={`${cg.label} budget`} onClose={() => router.back()} onSave={save} busy={busy} />
      <View style={{padding: 16, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center'}}>
        <Txt muted>A monthly limit for your share of {cg.label.toLowerCase()}, across all your groups and friends.</Txt>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
          <View style={{width: 56, height: 56, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center'}}>
            <Txt weight="bold" style={{fontSize: 20}}>{curSymbol(cur)}</Txt></View>
          <LineInput value={amt} onChangeText={setAmt} placeholder="0" keyboardType="decimal-pad" autoFocus accessibilityLabel="Monthly budget"
            style={{fontSize: 32, fontFamily: F.display}} onSubmitEditing={save} />
        </View>
        {!!hint && <Txt small color={c.owe}>{hint}</Txt>}
        <View style={{flexDirection: 'row', gap: 10}}>
          {!!now && <Button kind="ghost" title="Remove budget" onPress={remove} />}
          <View style={{flex: 1}} />
          <Button kind="primary" title="Save" onPress={save} busy={busy} />
        </View>
      </View>
    </View>
  );
}
