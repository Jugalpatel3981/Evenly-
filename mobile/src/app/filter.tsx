// Which friends and groups to show: all, or only those with balances.
import { router } from 'expo-router';
import { View } from 'react-native';

import { emit, S, useStore } from '@/lib/store';
import { FormBar } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { Row, Txt } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

const FILTERS: [string, string][] = [['all', 'All'], ['outstanding', 'Outstanding balances'], ['owe', 'People you owe'], ['owed', 'People who owe you']];

export default function Filter(){
  useStore();
  const {c} = useTheme();
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <FormBar title="Show" onClose={() => router.back()} />
      <View style={{padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center'}}>
        {FILTERS.map(([k, l]) => (
          <Row key={k} onPress={() => { S.filter = k; emit(); router.back(); }} accessibilityLabel={l}>
            <Txt weight="semi" style={{flex: 1}}>{l}</Txt>
            {S.filter === k && <Icon name="check" size={18} color={c.owed} />}
          </Row>
        ))}
      </View>
    </View>
  );
}
