// Colours and fonts, the same as the website's styles.css. Light, dark, or follow the phone.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

const light = {
  bg: '#eef3f0', surface: '#ffffff', ink: '#13211c', muted: '#5a6b64', line: '#d8e2dd', chip: '#e3ece7', hover: '#f4f8f6', field: '#eef3f0',
  accent: '#0e6650', accentInk: '#ffffff', owed: '#13784a', owe: '#bf4310', cta: '#c4470f', ctaInk: '#ffffff', banner: '#0e6650',
  cat: {ent: '#7c3aed', food: '#c2410c', home: '#0f766e', life: '#be185d', transport: '#1d4ed8', utilities: '#a16207', general: '#52525b'} as Record<string, string>,
};
const dark: typeof light = {
  bg: '#0d1412', surface: '#151f1b', ink: '#e4eee9', muted: '#93a59d', line: '#25332d', chip: '#1c2924', hover: '#1a2621', field: '#0f1714',
  accent: '#3fc59b', accentInk: '#052219', owed: '#4fd394', owe: '#fb8c5e', cta: '#fb8c5e', ctaInk: '#2a1205', banner: '#145c49',
  cat: {ent: '#b794f6', food: '#fb923c', home: '#2dd4bf', life: '#f472b6', transport: '#7aa2ff', utilities: '#facc15', general: '#a1a1aa'},
};
export type Colors = typeof light;

// Custom fonts on phones need one family per weight.
export const F = {
  display: 'BricolageGrotesque_700Bold', displayBlack: 'BricolageGrotesque_800ExtraBold',
  body: 'InstrumentSans_400Regular', medium: 'InstrumentSans_500Medium', semi: 'InstrumentSans_600SemiBold', bold: 'InstrumentSans_700Bold',
};

/* ---------- the person's choice: system, light or dark ---------- */
export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'evenly.theme';
let pref: ThemePref = 'system';
const subs = new Set<() => void>();
AsyncStorage.getItem(KEY).then(v => { if (v === 'light' || v === 'dark') { pref = v; subs.forEach(s => s()); } }).catch(() => {});
export function setThemePref(p: ThemePref){
  pref = p; subs.forEach(s => s());
  (p === 'system' ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, p)).catch(() => {});
}
const subscribe = (s: () => void) => { subs.add(s); return () => { subs.delete(s); }; };
export const useThemePref = () => useSyncExternalStore(subscribe, () => pref, () => pref);

export function useTheme(){
  const sys = useColorScheme();
  const p = useThemePref();
  const isDark = p === 'dark' || (p === 'system' && sys === 'dark');
  return {c: isDark ? dark : light, isDark};
}
