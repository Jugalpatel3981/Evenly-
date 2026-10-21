// Building blocks shared by screens and forms.
import { esc, initials, fmt, ALL_CURRENCIES, currencyName } from './util.js';
import { catOf } from './categories.js';
import { icon } from './icons.js';

export const $ = s => document.querySelector(s);

/* ---------- toast ---------- */
let toastT;
export function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3600);
}

/* ---------- sheets ---------- */
const sheet = () => $('#sheet'), body = () => $('#sheetBody');
export function openSheet(html, {full = false} = {}){
  // Full-screen pages (add expense, settle up, details) fill a phone screen; others are a card.
  sheet().classList.toggle('full', full);
  body().innerHTML = html;
  if (!sheet().open) sheet().showModal();
  body().scrollTop = 0;
  const f = body().querySelector('[autofocus]'); if (f) f.focus();
  return body();
}
export function closeSheet(){ if (sheet().open) sheet().close(); body().innerHTML = ''; }
export function initSheet(){
  sheet().addEventListener('click', e => { if (e.target === sheet()) closeSheet(); });
  // The close event arrives late: skip the wipe if another sheet has opened since.
  sheet().addEventListener('close', () => { if (!sheet().open) body().innerHTML = ''; });
  body().addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
}
export const head = t => `<div class="sheet-h"><h2>${t}</h2><button type="button" class="btn ghost icon-btn" data-close aria-label="Close">${icon('x', 20)}</button></div>`;
export const busy = (form, on) => form.querySelectorAll('button[type="submit"]').forEach(b => b.disabled = on);
export function armDelete(btn, fn, armed = 'Tap again to confirm'){
  btn.addEventListener('click', () => {
    if (btn.dataset.armed) { fn(); return; }
    btn.dataset.armed = '1'; const t = btn.innerHTML; btn.textContent = armed;
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.innerHTML = t; } }, 3500);
  });
}

/* ---------- small pieces ---------- */
export function avatar(name, url, cls = 'av'){
  return url ? `<span class="${cls} photo" aria-hidden="true"><img src="${esc(url)}" alt="" loading="lazy"></span>`
             : `<span class="${cls}" aria-hidden="true">${esc(initials(name))}</span>`;
}
export function catIcon(key){
  const c = catOf(key);
  return `<span class="ico" style="--c:var(--c-${c.color})" title="${esc(c.label)}">${icon(c.icon)}</span>`;
}
export const payIcon = () => `<span class="ico" style="--c:var(--accent)">${icon('arrow-left-right')}</span>`;

// "owes you ₹200" / "you owe $5" lines for a {currency: amount} map; positive means they owe me.
export function balanceLines(map, {they = 'owes you', you = 'you owe', zero = 'settled up'} = {}){
  const pos = Object.entries(map).filter(([, v]) => v > 0), neg = Object.entries(map).filter(([, v]) => v < 0);
  if (!pos.length && !neg.length) return `<span class="muted">${zero}</span>`;
  const line = (cls, label, list) => list.length ? `<span class="${cls}">${label}</span><b class="${cls}">${list.map(([c, v]) => fmt(v, c)).join(' + ')}</b>` : '';
  return line('pos', they, pos) + line('neg', you, neg);
}

export function currencyOptions(selected){
  return ALL_CURRENCIES.map(c => `<option value="${c}"${c === selected ? ' selected' : ''}>${c} · ${esc(currencyName(c))}</option>`).join('');
}

// Shrink a photo to at most `max` pixels on its longest side, as JPEG.
export async function resizeImage(file, max){
  if (!file || !/^image\//.test(file.type)) throw new Error('Choose an image file.');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not read that image.')), 'image/jpeg', 0.85));
}

export async function copyText(text, fallbackTitle = 'Copy this'){
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch {
    openSheet(`<div class="sheet-in">${head(fallbackTitle)}<textarea class="copybox" id="cBox" readonly>${esc(text)}</textarea></div>`);
    const b = $('#cBox'); b.focus(); b.select();
  }
}

// Save a generated file. Uses the share sheet on phones that support sharing files.
export async function downloadFile(name, text, type){
  const blob = new Blob([text], {type});
  try {
    const file = new File([blob], name, {type});
    if (navigator.canShare?.({files: [file]}) && /iphone|ipad|android/i.test(navigator.userAgent)) { await navigator.share({files: [file], title: name}); return; }
  } catch (err) { if (err?.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
