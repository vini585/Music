// Download de arquivos por link direto e busca de músicas livres no Internet Archive.
import * as St from './storage.js';
import { uid } from './util.js';

const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'webm', 'mkv'];
const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac'];

export function nameFromUrl(u) {
  try {
    const p = new URL(u).pathname.split('/').pop() || '';
    const d = decodeURIComponent(p).replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim();
    return d || 'Faixa baixada';
  } catch (e) { return 'Faixa baixada'; }
}

export function extFromUrl(u) {
  try {
    const p = new URL(u).pathname.split('/').pop() || '';
    const m = p.match(/\.([a-z0-9]{2,4})$/i);
    const e = m ? m[1].toLowerCase() : '';
    if (VIDEO_EXT.indexOf(e) >= 0 || AUDIO_EXT.indexOf(e) >= 0) return e;
  } catch (e) { /* usa padrão */ }
  return 'mp3';
}

// Lê duração e tipo (áudio/vídeo) de uma URL tocável. Devolve null se o navegador não reconhece o arquivo.
export function probeUrl(url) {
  return new Promise(res => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    let done = false;
    const fin = r => { if (done) return; done = true; v.removeAttribute('src'); try { v.load(); } catch (e) { /* ignora */ } res(r); };
    v.onloadedmetadata = () => fin({ duration: isFinite(v.duration) ? v.duration : 0, video: v.videoWidth > 0 });
    v.onerror = () => fin(null);
    setTimeout(() => fin({ duration: 0, video: false }), 8000);
    v.src = url;
  });
}

export async function probeBlob(blob) {
  const u = URL.createObjectURL(blob);
  try { return await probeUrl(u); } finally { URL.revokeObjectURL(u); }
}

export async function downloadUrl(url, opts) {
  const o = opts || {};
  const id = uid();
  const ext = extFromUrl(url);
  const t = {
    id, title: o.title || nameFromUrl(url), artist: o.artist || 'Artista desconhecido',
    ext: ext.toUpperCase(), video: VIDEO_EXT.indexOf(ext) >= 0, duration: 0, size: 0, fav: false, added: Date.now()
  };

  if (St.isNative()) {
    const FS = St.Cap.Plugins.Filesystem;
    const path = 'media/' + id + '.' + ext;
    let handle = null;
    try {
      handle = await FS.addListener('progress', e => {
        if (e.url === url && e.contentLength > 0 && o.onProgress) o.onProgress(e.bytes / e.contentLength);
      });
    } catch (e) { /* progresso é opcional */ }
    try {
      await FS.downloadFile({ url, path, directory: 'DATA', recursive: true, progress: true });
    } finally {
      if (handle && handle.remove) handle.remove();
    }
    const st = await FS.stat({ path, directory: 'DATA' });
    t.size = st.size;
    t.storage = 'fs';
    t.path = path;
    const info = await probeUrl(await St.fsUrl(path));
    if (!info) {
      await St.removeTrackFiles(t);
      throw new Error('O arquivo baixado não é áudio ou vídeo');
    }
    t.duration = info.duration;
    t.video = info.video;
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Servidor respondeu ' + res.status);
    const total = Number(res.headers.get('content-length')) || 0;
    let blob;
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        chunks.push(r.value);
        got += r.value.length;
        if (total && o.onProgress) o.onProgress(got / total);
      }
      blob = new Blob(chunks, { type: res.headers.get('content-type') || '' });
    } else {
      blob = await res.blob();
    }
    const info = await probeBlob(blob);
    if (!info) throw new Error('O arquivo baixado não é áudio ou vídeo');
    t.size = blob.size;
    t.storage = 'idb';
    t.duration = info.duration;
    t.video = info.video;
    await St.putBlob(id, blob);
  }
  await St.putTrack(t);
  return t;
}

/* ---------- Internet Archive (músicas livres e de domínio público) ---------- */

export async function searchArchive(text) {
  const q = '(' + text + ') AND mediatype:(audio)';
  const u = 'https://archive.org/advancedsearch.php?q=' + encodeURIComponent(q) +
    '&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&sort%5B%5D=downloads+desc&rows=25&page=1&output=json';
  const r = await fetch(u);
  if (!r.ok) throw new Error('Busca indisponível');
  const j = await r.json();
  return (j.response && j.response.docs ? j.response.docs : []).map(d => ({
    id: d.identifier,
    title: Array.isArray(d.title) ? d.title[0] : (d.title || d.identifier),
    creator: Array.isArray(d.creator) ? d.creator[0] : (d.creator || '')
  }));
}

export async function archiveFiles(id) {
  const r = await fetch('https://archive.org/metadata/' + encodeURIComponent(id));
  if (!r.ok) throw new Error('Item indisponível');
  const j = await r.json();
  let files = (j.files || []).filter(f => /\.(mp3|ogg|m4a|flac|wav)$/i.test(f.name) && f.source !== 'metadata');
  const mp3 = files.filter(f => /\.mp3$/i.test(f.name));
  if (mp3.length) files = mp3;
  files.sort((a, b) => (parseInt(a.track, 10) || 9999) - (parseInt(b.track, 10) || 9999) || a.name.localeCompare(b.name));
  const creator = (j.metadata && j.metadata.creator) ? [].concat(j.metadata.creator)[0] : '';
  return files.slice(0, 80).map(f => ({
    title: f.title || f.name.replace(/\.[^.]+$/, '').split('/').pop(),
    creator: f.creator || creator,
    size: Number(f.size) || 0,
    length: f.length,
    url: 'https://archive.org/download/' + encodeURIComponent(id) + '/' + f.name.split('/').map(encodeURIComponent).join('/')
  }));
}
