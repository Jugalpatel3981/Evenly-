// Pick a date in a browser: the browser's own date input, laid invisibly over the button.
import { View } from 'react-native';

import { Tool } from './controls';

export function DateTool({value, onChange, label}: {value: string; onChange: (iso: string) => void; label: string}){
  return (
    <View style={{position: 'relative'}}>
      <Tool icon="calendar" label={label} />
      <input type="date" value={value} aria-label="Date" onChange={e => e.target.value && onChange(e.target.value)}
        style={{position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer'}} />
    </View>
  );
}
