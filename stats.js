// Estatísticas de escuta: tempo total, por dia, por faixa e por artista.
import { kvGet, kvSet } from './storage.js';

let S = { total: 0, plays: 0, days: {}, tracks: {} };
let dirty = false;

export async function loadStats() {
  try {
    const v = await kvGet('stats', null);
    if (v) S = Object.assign({ total: 0, plays: 0, days: {}, tracks: {} }, v);
  } catch (e) { /* começa vazio */ }
}

export function dayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function entry(t) {
  const e = S.tracks[t.id] || (S.tracks[t.id] = { title: t.title, artist: t.artist, sec: 0, plays: 0 });
  e.title = t.title;
  e.artist = t.artist;
  return e;
}

export function addSeconds(t, sec) {
  S.total += sec;
  const k = dayKey();
  S.days[k] = (S.days[k] || 0) + sec;
  entry(t).sec += sec;
  dirty = true;
}

export function addPlay(t) {
  S.plays += 1;
  entry(t).plays += 1;
  dirty = true;
}

export function flush() {
  if (!dirty) return;
  dirty = false;
  kvSet('stats', S).catch(() => {});
}

setInterval(flush, 15000);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
window.addEventListener('pagehide', flush);

export const getStats = () => S;
export const todaySec = () => S.days[dayKey()] || 0;

export function lastDays(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKey(d);
    out.push({ key, date: d, sec: S.days[key] || 0 });
  }
  return out;
}

export function topTracks(n) {
  return Object.keys(S.tracks)
    .map(id => Object.assign({ id }, S.tracks[id]))
    .filter(t => t.sec > 0)
    .sort((a, b) => b.sec - a.sec)
    .slice(0, n);
}

export function topArtists(n) {
  const m = {};
  Object.keys(S.tracks).forEach(id => {
    const t = S.tracks[id];
    const a = t.artist || 'Artista desconhecido';
    const e = m[a] || (m[a] = { artist: a, sec: 0, plays: 0 });
    e.sec += t.sec;
    e.plays += t.plays;
  });
  return Object.values(m).filter(a => a.sec > 0).sort((a, b) => b.sec - a.sec).slice(0, n);
}

export function resetStats() {
  S = { total: 0, plays: 0, days: {}, tracks: {} };
  dirty = true;
  flush();
}
