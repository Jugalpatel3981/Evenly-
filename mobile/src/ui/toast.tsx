// Short messages at the bottom of the screen: "Expense added", "Saved".
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { F } from './theme';

let show: (msg: string) => void = () => {};
let timer: ReturnType<typeof setTimeout> | undefined;
export const toast = (msg: string) => show(msg);

export function ToastHost(){
  const [msg, setMsg] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    show = m => { setMsg(m); clearTimeout(timer); timer = setTimeout(() => setMsg(null), 3600); };
    return () => { show = () => {}; };
  }, []);
  if (!msg) return null;
  return (
    <View pointerEvents="none" style={{position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 84, alignItems: 'center'}}>
      <View accessibilityLiveRegion="polite" accessibilityRole="alert"
        style={{backgroundColor: '#13211c', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, maxWidth: 480,
          shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: {width: 0, height: 4}, elevation: 6}}>
        <Text style={{color: '#fff', fontFamily: F.semi, fontSize: 15, textAlign: 'center'}}>{msg}</Text>
      </View>
    </View>
  );
}
