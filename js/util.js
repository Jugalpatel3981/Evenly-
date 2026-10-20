// Small helpers shared by every screen.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
export const validEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const appUrl = () => location.origin + location.pathname;

export function niceDate(iso){
  return new Date(iso + (iso.length === 10 ? 'T00:00' : '')).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'});
}
export function ago(ts){
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ts).toLocaleDateString(undefined, {day: 'numeric', month: 'short'});
}

/* ---------- currencies ---------- */
// Everyday currencies first, then every ISO currency the browser knows.
export const COMMON_CURRENCIES = ['INR','USD','EUR','GBP','AED','CAD','AUD','SGD','NZD','CHF','JPY','CNY','HKD','THB','MYR','IDR','LKR','NPR','BDT','PKR','SAR','QAR','ZAR'];
export const ALL_CURRENCIES = (() => {
  let all = [];
  try { all = Intl.supportedValuesOf('currency'); } catch {}
  return [...COMMON_CURRENCIES, ...all.filter(c => !COMMON_CURRENCIES.includes(c)).sort()];
})();
const names = (() => { try { return new Intl.DisplayNames(undefined, {type: 'currency'}); } catch { return null; } })();
export const currencyName = c => { try { return names?.of(c) || c; } catch { return c; } };

const digitCache = {};
// Minor-unit digits: 2 for INR/USD, 0 for JPY, 3 for KWD.
export function digits(cur){
  if (digitCache[cur] == null) {
    try { digitCache[cur] = new Intl.NumberFormat('en', {style: 'currency', currency: cur}).resolvedOptions().maximumFractionDigits; }
    catch { digitCache[cur] = 2; }
  }
  return digitCache[cur];
}
// "1,234.50" in USD -> 123450. NaN when it isn't a number.
export function toMinor(str, cur){
  const n = parseFloat(String(str ?? '').replace(/[, ]/g, ''));
  return isFinite(n) ? Math.round(n * 10 ** digits(cur)) : NaN;
}
export const fromMinor = (minor, cur) => (minor / 10 ** digits(cur)).toFixed(digits(cur));

const fmts = {};
export function fmt(minor, cur = 'INR'){
  const key = cur;
  if (!fmts[key]) {
    try { fmts[key] = new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : undefined, {style: 'currency', currency: cur}); }
    catch { fmts[key] = {format: v => `${cur} ${v.toFixed(2)}`}; }
  }
  return fmts[key].format(Math.abs(minor) / 10 ** digits(cur));
}
// {INR: 20000, USD: 500} -> "₹200.00 + $5.00" (absolute values).
export function fmtMulti(map){
  const parts = Object.entries(map || {}).filter(([, v]) => v).map(([c, v]) => fmt(v, c));
  return parts.join(' + ');
}

// "₹", "$", "€"… for a currency, for the small currency button.
export function curSymbol(cur){
  try { return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', {style: 'currency', currency: cur}).formatToParts(0).find(p => p.type === 'currency')?.value || cur; }
  catch { return cur; }
}
