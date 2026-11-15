export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmt(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), x = Math.floor(s % 60);
  return m + ':' + String(x).padStart(2, '0');
}

export function fmtLong(s) {
  s = Math.round(s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h) return h + ' h ' + m + ' min';
  if (m) return m + ' min';
  return s + ' s';
}

export function fmtSize(b) {
  if (!b) return '';
  return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
}

export function uid() {
  try { return crypto.randomUUID(); } catch (e) { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
}

export const icon = (id, stroke = true) => `<svg class="ic${stroke ? ' s' : ''}"><use href="#${id}"/></svg>`;

let toastTimer = 0;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

export function parseName(fn) {
  const base = fn.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').replace(/^\s*\d{1,3}[.\-\s]+(?=\D)/, '').trim();
  let artist = 'Artista desconhecido', title = base || fn;
  const m = base.split(/\s[-–—]\s/);
  if (m.length > 1) { artist = m[0].trim(); title = m.slice(1).join(' - ').trim(); }
  return { title, artist };
}
