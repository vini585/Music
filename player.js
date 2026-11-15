// Motor de reprodução: fila, aleatório, repetir, velocidade, visualizador e contagem de escuta.
import { getPlayable } from './storage.js';
import { addSeconds, addPlay } from './stats.js';

export const media = document.getElementById('media');
export const state = { curId: null, queue: [], shuffle: false, repeat: 'off', speedIdx: 1 };
export const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

let H = { getTrack: () => null, onChange() {}, onError() {}, onDuration() {} };
let ac = null, an = null, fdata = null, curSrc = null, token = 0, sess = 0, counted = false;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function init(handlers) {
  H = Object.assign(H, handlers);
  media.addEventListener('play', () => H.onChange());
  media.addEventListener('pause', () => H.onChange());
  media.addEventListener('ended', () => step(1, true));
  media.addEventListener('error', () => { if (state.curId) H.onError('Não foi possível tocar este arquivo'); });
  media.addEventListener('loadedmetadata', () => H.onDuration(state.curId, media.duration, media.videoWidth > 0));
  setInterval(tickStats, 1000);
}

function tickStats() {
  if (media.paused || media.seeking || !state.curId) return;
  const t = H.getTrack(state.curId);
  if (!t) return;
  addSeconds(t, 1);
  sess += 1;
  const need = Math.min(30, (media.duration > 0 && isFinite(media.duration) ? media.duration : 60) * 0.5);
  if (!counted && sess >= need) { counted = true; addPlay(t); }
}

function ensureAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const src = ac.createMediaElementSource(media);
    an = ac.createAnalyser();
    an.fftSize = 256;
    an.smoothingTimeConstant = 0.82;
    src.connect(an);
    an.connect(ac.destination);
    fdata = new Uint8Array(an.frequencyBinCount);
  } catch (e) { ac = null; an = null; }
}

export const isPlaying = () => !media.paused && !!state.curId;

export async function play(id, queue) {
  const t = H.getTrack(id);
  if (!t) return;
  if (queue) state.queue = queue.slice();
  else if (state.queue.indexOf(id) < 0) state.queue = [id];
  ensureAudio();
  const my = ++token;
  let src;
  try { src = await getPlayable(t); } catch (e) { H.onError('Arquivo não encontrado'); return; }
  if (my !== token) { src.revoke(); return; }
  if (curSrc) curSrc.revoke();
  curSrc = src;
  state.curId = id;
  sess = 0;
  counted = false;
  media.src = src.url;
  media.playbackRate = SPEEDS[state.speedIdx];
  try { await media.play(); } catch (e) { /* o usuário pode tocar em play */ }
  setSession(t);
  H.onChange();
}

export function toggle() {
  if (!state.curId) return false;
  ensureAudio();
  if (media.paused) media.play().catch(() => {}); else media.pause();
  return true;
}

export function step(dir, auto) {
  const q = state.queue.filter(id => H.getTrack(id));
  if (!q.length) return;
  const i = q.indexOf(state.curId);
  if (auto && state.repeat === 'one') { media.currentTime = 0; media.play().catch(() => {}); return; }
  if (!auto && dir < 0 && media.currentTime > 3) { media.currentTime = 0; return; }
  if (state.shuffle && q.length > 1) {
    let j;
    do { j = Math.floor(Math.random() * q.length); } while (j === i);
    play(q[j]);
    return;
  }
  let n = i + dir;
  if (n >= q.length) {
    if (state.repeat === 'all' || !auto) n = 0;
    else { media.pause(); media.currentTime = 0; return; }
  }
  if (n < 0) n = q.length - 1;
  play(q[n]);
}

export function seek(frac) {
  const d = media.duration;
  if (d > 0 && isFinite(d)) media.currentTime = frac * d;
}
export function toggleShuffle() { state.shuffle = !state.shuffle; H.onChange(); }
export function cycleRepeat() { state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off'; H.onChange(); }
export function cycleSpeed() { state.speedIdx = (state.speedIdx + 1) % SPEEDS.length; media.playbackRate = SPEEDS[state.speedIdx]; H.onChange(); }

export function stopIfCurrent(id) {
  if (state.curId !== id) return;
  token++;
  media.pause();
  media.removeAttribute('src');
  try { media.load(); } catch (e) { /* ignora */ }
  if (curSrc) { curSrc.revoke(); curSrc = null; }
  state.curId = null;
  H.onChange();
}

function setSession(t) {
  try {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist });
    navigator.mediaSession.setActionHandler('play', toggle);
    navigator.mediaSession.setActionHandler('pause', toggle);
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1, false));
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1, false));
  } catch (e) { /* sem suporte */ }
}

// Visualizador radial desenhado em um canvas já dimensionado pelo app.
export function drawViz(cv, now) {
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  if (!w || !h) return;
  const cs = getComputedStyle(document.documentElement);
  const A = cs.getPropertyValue('--accent').trim(), B = cs.getPropertyValue('--accent2').trim();
  const L = cs.getPropertyValue('--line').trim(), F = cs.getPropertyValue('--fg').trim(), M = cs.getPropertyValue('--muted').trim();
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.27;
  const dpr = w / Math.max(1, cv.getBoundingClientRect().width);
  const playing = !media.paused && !!an;
  if (playing) an.getByteFrequencyData(fdata);
  const bins = fdata ? fdata.length : 64;
  let bass = 0;
  if (playing) { for (let b = 0; b < 6; b++) bass += fdata[b]; bass /= 6 * 255; }

  const g0 = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * (1.5 + bass * 0.5));
  g0.addColorStop(0, A);
  g0.addColorStop(1, 'transparent');
  ctx.globalAlpha = 0.1 + bass * 0.22;
  ctx.fillStyle = g0;
  ctx.beginPath();
  ctx.arc(cx, cy, R * (1.5 + bass * 0.5), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const N = 84;
  const grad = ctx.createLinearGradient(cx - R * 1.7, cy - R * 1.7, cx + R * 1.7, cy + R * 1.7);
  grad.addColorStop(0, A);
  grad.addColorStop(1, B);
  ctx.strokeStyle = grad;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, R * 0.045);
  for (let i = 0; i < N; i++) {
    const j = i < N / 2 ? i : N - 1 - i, k = j / (N / 2);
    let v;
    if (playing) { const idx = Math.min(bins - 1, Math.floor(Math.pow(k, 1.25) * bins * 0.7)); v = fdata[idx] / 255; }
    else v = 0.05 + (reduce ? 0 : 0.04 * (1 + Math.sin(now / 700 + i * 0.45)));
    const a = i / N * Math.PI * 2 - Math.PI / 2, r0 = R * 1.08, r1 = r0 + R * (0.08 + v * 0.62);
    ctx.globalAlpha = 0.35 + v * 0.65;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const d = media.duration, p = d > 0 && isFinite(d) ? (media.currentTime || 0) / d : 0;
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = L;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.94, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3.5 * dpr;
  ctx.strokeStyle = A;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.94, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
  ctx.stroke();

  const t = H.getTrack(state.curId);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = M;
  ctx.font = '500 ' + Math.round(R * 0.15) + 'px JetBrains Mono, monospace';
  ctx.fillText(t ? (t.ext || '') : 'ORBITA', cx, cy - R * 0.26);
  ctx.fillStyle = F;
  ctx.font = '500 ' + Math.round(R * 0.3) + 'px JetBrains Mono, monospace';
  const s = Math.floor(media.currentTime || 0);
  ctx.fillText(Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'), cx, cy + R * 0.08);
}
