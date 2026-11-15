// Armazenamento: metadados no IndexedDB; arquivos em disco (Android) ou no IndexedDB (navegador).
const DB_NAME = 'orbita-v1';
let dbp = null;

function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('tracks', { keyPath: 'id' });
      d.createObjectStore('blobs');
      d.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function run(stores, mode, fn) {
  return db().then(d => new Promise((res, rej) => {
    const t = d.transaction(stores, mode);
    let out;
    try { out = fn(t); } catch (e) { rej(e); return; }
    t.oncomplete = () => res(out && typeof out === 'object' && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

export const Cap = window.Capacitor;
export const isNative = () => !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const FS = () => Cap && Cap.Plugins && Cap.Plugins.Filesystem;

export const getTracks = () => run('tracks', 'readonly', t => t.objectStore('tracks').getAll());
export const putTrack = meta => run('tracks', 'readwrite', t => t.objectStore('tracks').put(meta));
export const putBlob = (id, blob) => run('blobs', 'readwrite', t => t.objectStore('blobs').put(blob, id));
export const getBlob = id => run('blobs', 'readonly', t => t.objectStore('blobs').get(id));
export const kvGet = (k, def) => run('kv', 'readonly', t => t.objectStore('kv').get(k)).then(v => (v === undefined ? def : v));
export const kvSet = (k, v) => run('kv', 'readwrite', t => t.objectStore('kv').put(v, k));

export async function fsUrl(path) {
  const r = await FS().getUri({ path, directory: 'DATA' });
  return Cap.convertFileSrc(r.uri);
}

// Devolve { url, revoke } para o elemento de mídia tocar a faixa.
export async function getPlayable(t) {
  if (t.storage === 'fs') return { url: await fsUrl(t.path), revoke() {} };
  const b = await getBlob(t.id);
  if (!b) throw new Error('Arquivo não encontrado');
  const url = URL.createObjectURL(b);
  return { url, revoke() { URL.revokeObjectURL(url); } };
}

export async function removeTrackFiles(t) {
  if (t.storage === 'fs') {
    try { await FS().deleteFile({ path: t.path, directory: 'DATA' }); } catch (e) { /* já removido */ }
  }
  await run(['tracks', 'blobs'], 'readwrite', tx => {
    tx.objectStore('tracks').delete(t.id);
    tx.objectStore('blobs').delete(t.id);
  });
}
