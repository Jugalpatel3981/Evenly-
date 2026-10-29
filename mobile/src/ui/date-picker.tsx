// Pick a date. Android shows its own calendar dialog; iPhone shows a calendar in a sheet.
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';

import { Tool } from './controls';
import { Button } from './kit';
import { useTheme } from './theme';

const toDate = (iso: string) => new Date(iso + 'T00:00');
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function DateTool({value, onChange, label}: {value: string; onChange: (iso: string) => void; label: string}){
  const {c, isDark} = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(toDate(value));
  const press = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({value: toDate(value), mode: 'date', onValueChange: (_e, d) => { if (d) onChange(toIso(d)); }});
    } else { setDraft(toDate(value)); setOpen(true); }
  };
  return (
    <>
      <Tool icon="calendar" label={label} onPress={press} accessibilityLabel={`Date: ${label}`} />
      {open && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={{flex: 1, backgroundColor: '#0008'}} onPress={() => setOpen(false)} />
          <View style={{position: 'absolute', left: 16, right: 16, top: '20%', backgroundColor: c.surface, borderRadius: 18, padding: 12, gap: 8}}>
            <DateTimePicker value={draft} mode="date" display="inline" themeVariant={isDark ? 'dark' : 'light'} accentColor={c.accent}
              onValueChange={(_e, d) => setDraft(d)} />
            <Button kind="primary" title="Done" onPress={() => { onChange(toIso(draft)); setOpen(false); }} />
          </View>
        </Modal>
      )}
    </>
  );
}
