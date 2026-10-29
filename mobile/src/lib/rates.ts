// Exchange rates from free services that need no key, refreshed at most twice a day and kept on the device.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { convert, type Map } from './money';
import { digits } from './util';

type Rates = {base: string; rates: Map; at: number; source: string};
const KEY = 'evenly.rates', MAX_AGE = 12 * 3600 * 1000;
let cached: Rates | null = null;
const loaded = AsyncStorage.getItem(KEY).then(v => { if (v && !cached) cached = JSON.parse(v); }).catch(() => {});

const SOURCES = [
  // About 160 currencies, US dollar base.
  {url: 'https://open.er-api.com/v6/latest/USD', read: (j: any) => j.result === 'success' && {base: 'USD', rates: j.rates}, name: 'ExchangeRate-API'},
  // European Central Bank rates, euro base: fewer currencies, but a good fallback.
  {url: 'https://api.frankfurter.app/latest', read: (j: any) => j.rates && {base: 'EUR', rates: {...j.rates, EUR: 1}}, name: 'European Central Bank'},
];

export const rates = () => cached;
export async function refreshRates(){
  await loaded;
  if (cached && Date.now() - cached.at < MAX_AGE) return cached;
  for (const s of SOURCES) {
    try {
      const r = await fetch(s.url);
      if (!r.ok) continue;
      const got = s.read(await r.json());
      if (!got) continue;
      cached = {...got, at: Date.now(), source: s.name};
      AsyncStorage.setItem(KEY, JSON.stringify(cached)).catch(() => {});
      return cached;
    } catch { /* offline or blocked: try the next source, else keep the old rates */ }
  }
  return cached;
}
// minor units of `from` -> minor units of `to`, or null when there's no rate.
export const toCurrency = (minor: number, from: string, to: string) => convert(minor, from, to, cached?.rates, digits);
// {INR: 20000, USD: 500} -> total in `to`, or null if a rate is missing.
export function sumIn(map: Map, to: string){
  let t = 0;
  for (const [c, v] of Object.entries(map || {})) { const x = toCurrency(v, c, to); if (x == null) return null; t += x; }
  return t;
}
