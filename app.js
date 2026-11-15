import { $, $$, esc, fmt, fmtLong, fmtSize, uid, icon, toast, parseName } from './util.js';
import * as St from './storage.js';
import * as P from './player.js';
import * as Stats from './stats.js';
import * as DL from './download.js';

const D = { tracks: [], playlists: [] };
const U = { tab: 'library', filter: 'all', q: '', plId: null, mode: 'archive', sq: '', results: null, searching: false, searchError: '', range: 7, lurl: '', ltitle: '' };
let listIds = [];
let dlItems = [];

const view = $('#view');
const npEl = $('#np');
const sheetEl = $('#sheet');
const byId = id => D.tracks.find(t => t.id === id);
const metaOf = t => t;

/* ---------- playlists ---------- */
const savePlaylists = () => St.kvSet('playlists', D.playlists).catch(() => {});
const getPl = id => D.playlists.find(p => p.id === id);
function plIds(id) {
  if (id === 'fav') return D.tracks.filter(t => t.fav).map(t => t.id);
  const p = getPl(id);
  return p ? p.ids.filter(x => byId(x)) : [];
}
const plName = id => (id === 'fav' ? 'Favoritas' : (getPl(id) || {}).name || 'Playlist');
function plTime(id) { return plIds(id).reduce((a, x) => a + (byId(x).duration || 0), 0); }
function hueOf(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }

function createPlaylist(name, ids) {
  const p = { id: uid(), name: name.trim() || 'Nova playlist', ids: ids || [], created: Date.now() };
  D.playlists.push(p);
  savePlaylists();
  return p;
}

/* ---------- sheet ---------- */
let sheetH = null;
function openSheet(title, html, handler) {
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = html;
  sheetH = handler || null;
  sheetEl.classList.add('open');
  sheetEl.setAttribute('aria-hidden', 'false');
}
function closeSheet() {
  sheetEl.classList.remove('open');
  sheetEl.setAttribute('aria-hidden', 'true');
  sheetH = null;
}
sheetEl.addEventListener('click', e => {
  if (e.target === sheetEl) { closeSheet(); return; }
  if (sheetH) sheetH(e);
});

function menuSheet(title, items) {
  const html = items.map((it, i) =>
    `<button class="menu-item${it.danger ? ' danger' : ''}" data-i="${i}">${icon(it.icon || 'i-more', it.icon !== 'i-more')}<span>${esc(it.label)}</span>${it.badge ? '<em>' + esc(it.badge) + '</em>' : ''}</button>`).join('');
  openSheet(title, html, e => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const it = items[+b.dataset.i];
    if (it.confirm && b.dataset.sure !== '1') {
      b.dataset.sure = '1';
      b.querySelector('span').textContent = 'Toque de novo para confirmar';
      return;
    }
    closeSheet();
    it.fn();
  });
}

function promptSheet(title, placeholder, initial, okLabel, onOk) {
  openSheet(title,
    `<div class="form"><input class="field" id="sheet-input" maxlength="60" placeholder="${esc(placeholder)}" value="${esc(initial)}" autocomplete="off"><button class="btn" data-ok="1">${esc(okLabel)}</button></div>`,
    e => {
      if (!e.target.closest('[data-ok]')) return;
      const v = $('#sheet-input').value.trim();
      if (!v) { toast('Digite um nome'); return; }
      closeSheet();
      onOk(v);
    });
  setTimeout(() => { const i = $('#sheet-input'); if (i) { i.focus(); i.select(); } }, 80);
}
sheetEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'sheet-input') { e.preventDefault(); const b = $('[data-ok]', sheetEl); if (b) b.click(); }
});

/* ---------- linhas de faixa ---------- */
function row(t) {
  const cur = t.id === P.state.curId;
  return `<div class="row" data-id="${esc(t.id)}" data-cur="${cur}">
    <button class="row-main" data-act="play" aria-label="Tocar ${esc(t.title)}">
      <span class="cov${t.video ? ' vid' : ''}">${icon(t.video ? 'i-film' : 'i-music')}<i class="eq" aria-hidden="true"><b></b><b></b><b></b></i></span>
      <span class="meta"><span class="t">${esc(t.title)}</span><span class="a">${esc(t.artist)}${t.video ? ' · vídeo' : ''}</span></span>
      <span class="dur">${fmt(t.duration)}</span>
    </button>
    <button class="ib" data-act="fav" aria-pressed="${!!t.fav}" aria-label="Favoritar">${icon('i-heart')}</button>
    <button class="ib" data-act="more" aria-label="Mais opções">${icon('i-more', false)}</button>
  </div>`;
}
function emptyBlock(title, text, cta) {
  return `<div class="empty"><strong>${esc(title)}</strong><p>${esc(text)}</p>${cta || ''}</div>`;
}

/* ---------- biblioteca ---------- */
function libIds() {
  const q = U.q.trim().toLowerCase();
  return D.tracks.filter(t =>
    (U.filter === 'all' || (U.filter === 'fav' && t.fav) || (U.filter === 'video' && t.video)) &&
    (!q || (t.title + ' ' + t.artist).toLowerCase().indexOf(q) >= 0)).map(t => t.id);
}
function viewLibrary() {
  const chip = (k, l) => `<button class="chip" data-act="filter" data-f="${k}" aria-pressed="${U.filter === k}">${l}</button>`;
  return `<div class="vhead"><div><h1>Biblioteca</h1><span class="sub">${D.tracks.length} ${D.tracks.length === 1 ? 'faixa' : 'faixas'} · ${fmtLong(D.tracks.reduce((a, t) => a + (t.duration || 0), 0))}</span></div>
      <button class="btn sm" data-act="import">${icon('i-plus')}Importar</button></div>
    <label class="search">${icon('i-search')}<input id="q" type="search" placeholder="Buscar na biblioteca" value="${esc(U.q)}" autocomplete="off"></label>
    <div class="chips-row">${chip('all', 'Todas')}${chip('fav', 'Favoritas')}${chip('video', 'Vídeos')}</div>
    <div id="lib-list"></div>`;
}
function fillLib() {
  const ids = libIds();
  listIds = ids;
  const box = $('#lib-list');
  if (!box) return;
  if (ids.length) box.innerHTML = ids.map(id => row(byId(id))).join('');
  else if (U.q.trim()) box.innerHTML = emptyBlock('Nada encontrado', 'Tente outro nome ou artista.');
  else if (U.filter === 'fav') box.innerHTML = emptyBlock('Nenhuma favorita ainda', 'Toque no coração de uma faixa para ela aparecer aqui.');
  else if (U.filter === 'video') box.innerHTML = emptyBlock('Nenhum vídeo', 'Importe um MP4 ou baixe por link na aba Baixar.');
  else box.innerHTML = emptyBlock('Biblioteca vazia', 'Importe músicas e vídeos do celular ou baixe na aba Baixar.',
    `<button class="btn" data-act="import">${icon('i-plus')}Importar do celular</button>`);
  refreshCur();
}

/* ---------- baixar ---------- */
function viewSearch() {
  const m = k => `aria-pressed="${U.mode === k}"`;
  let body;
  if (U.mode === 'archive') {
    let res = '';
    if (U.searching) res = '<p class="status">Buscando…</p>';
    else if (U.searchError) res = `<p class="status">${esc(U.searchError)}</p>`;
    else if (U.results && !U.results.length) res = '<p class="status">Nada encontrado. Tente outras palavras.</p>';
    else if (U.results) res = `<div class="card">${U.results.map((r, i) => `<div class="res-row"><div class="meta"><span class="t">${esc(r.title)}</span><span class="a">${esc(r.creator || 'Internet Archive')}</span></div><button class="btn sm ghost" data-act="ia-open" data-i="${i}">Ver faixas</button></div>`).join('')}</div>`;
    body = `<form id="sform" class="form"><label class="search">${icon('i-search')}<input id="sq" type="search" placeholder="Nome da música ou artista" value="${esc(U.sq)}" autocomplete="off"></label><button class="btn" type="submit">Buscar</button></form><div style="margin-top:12px">${res}</div>`;
  } else {
    body = `<form id="lform" class="form"><input class="field" id="lurl" type="url" inputmode="url" placeholder="Link direto do arquivo (.mp3, .mp4…)" value="${esc(U.lurl)}" autocomplete="off"><input class="field" id="ltitle" placeholder="Título (opcional)" value="${esc(U.ltitle)}" maxlength="80"><button class="btn" type="submit" id="lbtn">${icon('i-download')}Baixar</button><p class="status" id="lprog" hidden></p></form>`;
  }
  return `<div class="vhead"><h1>Baixar</h1></div>
    <div class="seg"><button data-act="mode" data-m="archive" ${m('archive')}>Buscar músicas</button><button data-act="mode" data-m="link" ${m('link')}>Colar link</button></div>
    ${body}
    <p class="note">Baixe só o que você tem direito de usar. A busca mostra o acervo do Internet Archive (domínio público e licenças abertas, mas confira a licença de cada item). O link precisa apontar direto para um arquivo de áudio ou vídeo.</p>`;
}
async function doSearch() {
  const q = ($('#sq').value || '').trim();
  U.sq = q;
  if (!q) { toast('Digite o que quer buscar'); return; }
  U.searching = true; U.searchError = ''; U.results = null;
  render(true);
  try { U.results = await DL.searchArchive(q); }
  catch (e) { U.searchError = 'Não foi possível buscar agora. Verifique a conexão.'; }
  U.searching = false;
  if (U.tab === 'search') render(true);
}
async function openArchiveItem(i) {
  const r = U.results[i];
  openSheet(r.title, '<p class="status">Carregando faixas…</p>');
  try {
    const files = await DL.archiveFiles(r.id);
    dlItems = files.map(f => Object.assign({}, f, { creator: f.creator || r.creator }));
    if (!dlItems.length) { $('#sheet-body').innerHTML = '<p class="status">Este item não tem arquivos de áudio.</p>'; return; }
    $('#sheet-body').innerHTML = dlItems.map((f, k) =>
      `<div class="row"><div class="meta"><span class="t">${esc(f.title)}</span><span class="a">${esc([fmtSize(f.size), f.length ? fmt(parseFloat(f.length)) : ''].filter(Boolean).join(' · '))}</span></div><button class="btn sm" data-dl="${k}">${icon('i-download')}Baixar</button></div>`).join('');
    sheetH = e => {
      const b = e.target.closest('[data-dl]');
      if (b && !b.disabled) startDownload(dlItems[+b.dataset.dl], b);
    };
  } catch (e) {
    $('#sheet-body').innerHTML = '<p class="status">Não foi possível carregar este item.</p>';
  }
}
async function startDownload(item, btn) {
  btn.disabled = true;
  btn.textContent = '0%';
  try {
    const t = await DL.downloadUrl(item.url, { title: item.title, artist: item.creator, onProgress: p => { btn.textContent = Math.round(p * 100) + '%'; } });
    D.tracks.unshift(t);
    btn.innerHTML = icon('i-check') + 'Baixado';
    toast('Adicionada à biblioteca');
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Tentar de novo';
    toast('Falha no download: ' + (e.message || 'erro desconhecido'));
  }
}
async function doLink() {
  const url = ($('#lurl').value || '').trim();
  U.lurl = url; U.ltitle = ($('#ltitle').value || '').trim();
  if (!/^https?:\/\//i.test(url)) { toast('Cole um link que comece com http:// ou https://'); return; }
  const btn = $('#lbtn'), prog = $('#lprog');
  btn.disabled = true; prog.hidden = false; prog.textContent = 'Baixando… 0%';
  try {
    const t = await DL.downloadUrl(url, { title: U.ltitle || undefined, onProgress: p => { prog.textContent = 'Baixando… ' + Math.round(p * 100) + '%'; } });
    D.tracks.unshift(t);
    U.lurl = ''; U.ltitle = '';
    toast('Adicionada à biblioteca');
    if (U.tab === 'search') render(true);
  } catch (e) {
    prog.textContent = 'Falhou: ' + (e.message || 'erro desconhecido');
    btn.disabled = false;
  }
}

/* ---------- playlists ---------- */
function viewPlaylists() {
  const card = (id, name, n, secs, isFav) => `<button class="plcard" data-act="pl-open" data-pl="${esc(id)}"><div class="plcover" style="--h:${isFav ? 330 : hueOf(name)}">${icon(isFav ? 'i-heart' : 'i-list')}</div><strong>${esc(name)}</strong><span>${n} ${n === 1 ? 'faixa' : 'faixas'}${secs ? ' · ' + fmtLong(secs) : ''}</span></button>`;
  const cards = [card('fav', 'Favoritas', plIds('fav').length, plTime('fav'), true)]
    .concat(D.playlists.map(p => card(p.id, p.name, plIds(p.id).length, plTime(p.id), false))).join('');
  return `<div class="vhead"><h1>Playlists</h1><button class="btn sm" data-act="pl-new">${icon('i-plus')}Nova</button></div><div class="pl-grid">${cards}</div>`;
}
function viewPlaylistDetail() {
  const id = U.plId, ids = plIds(id);
  listIds = ids;
  const list = ids.length ? ids.map(x => row(byId(x))).join('') :
    emptyBlock('Playlist vazia', id === 'fav' ? 'Toque no coração de uma faixa para ela aparecer aqui.' : 'Use o menu ⋯ de uma faixa e escolha Adicionar à playlist.');
  return `<button class="back" data-act="pl-back">${icon('i-left')}Playlists</button>
    <div class="vhead"><div><h1>${esc(plName(id))}</h1><span class="sub">${ids.length} ${ids.length === 1 ? 'faixa' : 'faixas'}${plTime(id) ? ' · ' + fmtLong(plTime(id)) : ''}</span></div>
      ${id === 'fav' ? '' : `<button class="ib" data-act="pl-menu" aria-label="Opções da playlist">${icon('i-more', false)}</button>`}</div>
    <div class="pl-actions"><button class="btn" data-act="pl-play">${icon('i-play', false)}Tocar</button><button class="btn ghost" data-act="pl-shuffle">${icon('i-shuffle')}Aleatório</button></div>
    ${list}`;
}
function plMenu() {
  const id = U.plId;
  menuSheet(plName(id), [
    { label: 'Renomear', icon: 'i-list', fn: () => promptSheet('Renomear playlist', 'Nome', plName(id), 'Salvar', v => { getPl(id).name = v; savePlaylists(); render(true); }) },
    { label: 'Apagar playlist', icon: 'i-trash', danger: true, confirm: true, fn: () => { D.playlists = D.playlists.filter(p => p.id !== id); savePlaylists(); U.plId = null; render(true); toast('Playlist apagada'); } }
  ]);
}
function pickPlaylist(trackId) {
  const t = byId(trackId);
  if (!t) return;
  const items = D.playlists.map(p => ({
    label: p.name, icon: 'i-list', badge: p.ids.indexOf(trackId) >= 0 ? 'na playlist' : '',
    fn: () => {
      const i = p.ids.indexOf(trackId);
      if (i >= 0) { p.ids.splice(i, 1); toast('Removida de ' + p.name); } else { p.ids.push(trackId); toast('Adicionada a ' + p.name); }
      savePlaylists(); if (U.tab === 'playlists') render(true);
    }
  }));
  items.push({ label: 'Nova playlist…', icon: 'i-plus', fn: () => promptSheet('Nova playlist', 'Nome da playlist', '', 'Criar', v => { createPlaylist(v, [trackId]); toast('Playlist criada'); if (U.tab === 'playlists') render(true); }) });
  menuSheet('Adicionar à playlist', items);
}

/* ---------- estatísticas ---------- */
function chartSvg(days) {
  const W = 320, H = 140, base = 22, top = 16, n = days.length;
  const max = Math.max(60, ...days.map(d => d.sec));
  const bw = W / n, todayKey = Stats.dayKey();
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tempo ouvido por dia">`;
  s += `<line class="base" x1="0" x2="${W}" y1="${H - base}" y2="${H - base}"/>`;
  s += `<text x="0" y="10">máx. ${Math.max(1, Math.round(max / 60))} min</text>`;
  days.forEach((d, i) => {
    const h = d.sec > 0 ? Math.max(3, (d.sec / max) * (H - base - top)) : 2;
    const x = i * bw + bw * 0.16, w = bw * 0.68, y = H - base - h;
    s += `<rect class="bar${d.sec ? '' : ' zero'}${d.key === todayKey ? ' today' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3"/>`;
    const showLabel = n <= 7 || i % 5 === 0 || i === n - 1;
    if (showLabel) {
      const lbl = n <= 7 ? d.date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') : String(d.date.getDate());
      s += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(lbl)}</text>`;
    }
  });
  return s + '</svg>';
}
function viewStats() {
  const S = Stats.getStats();
  if (!S.total) {
    return `<div class="vhead"><h1>Estatísticas</h1></div>${emptyBlock('Ainda sem dados', 'Ouça algumas faixas e o tempo de escuta, as músicas e os artistas mais ouvidos aparecem aqui.')}`;
  }
  const tt = Stats.topTracks(8), ta = Stats.topArtists(5);
  const rankList = (arr, nameOf, subOf) => {
    const mx = arr.length ? arr[0].sec : 1;
    return arr.map((x, i) => `<div class="rank"><span class="n">${i + 1}</span><div class="meta"><span class="t">${esc(nameOf(x))}</span><span class="a">${esc(subOf(x))}</span><div class="bar"><i style="width:${Math.max(4, Math.round(x.sec / mx * 100))}%"></i></div></div><span class="v">${x.plays}× · ${fmtLong(x.sec)}</span></div>`).join('');
  };
  const days = Stats.lastDays(U.range);
  const rng = n => `<button class="chip" data-act="range" data-n="${n}" aria-pressed="${U.range === n}">${n} dias</button>`;
  return `<div class="vhead"><h1>Estatísticas</h1></div>
    <div class="card hero"><span class="lbl">Tempo total ouvindo</span><span class="big">${fmtLong(S.total)}</span>
      <div class="kpis"><div class="kpi"><b>${fmtLong(Stats.todaySec())}</b><span>hoje</span></div><div class="kpi"><b>${S.plays}</b><span>reproduções</span></div><div class="kpi"><b>${Object.keys(S.tracks).length}</b><span>faixas ouvidas</span></div></div></div>
    <div class="sec-title"><span>Por dia</span><span style="display:flex;gap:6px">${rng(7)}${rng(30)}</span></div>
    <div class="card">${chartSvg(days)}</div>
    <div class="sec-title"><span>Mais ouvidas</span></div>
    <div class="card">${rankList(tt, x => x.title, x => x.artist)}</div>
    <div class="sec-title"><span>Artistas</span></div>
    <div class="card">${rankList(ta, x => x.artist, x => x.plays + (x.plays === 1 ? ' reprodução' : ' reproduções'))}</div>
    <div style="margin:18px 0 6px;text-align:center"><button class="btn ghost sm" data-act="stats-reset">Zerar estatísticas</button></div>`;
}

/* ---------- render geral ---------- */
function render(keepScroll) {
  const sc = view.scrollTop;
  $$('.tab').forEach(b => b.setAttribute('aria-current', b.dataset.tab === U.tab ? 'page' : 'false'));
  if (U.tab === 'library') { view.innerHTML = viewLibrary(); fillLib(); }
  else if (U.tab === 'search') view.innerHTML = viewSearch();
  else if (U.tab === 'playlists') view.innerHTML = U.plId ? viewPlaylistDetail() : viewPlaylists();
  else view.innerHTML = viewStats();
  view.scrollTop = keepScroll ? sc : 0;
  refreshCur();
}
function refreshCur() {
  $$('.row', view).forEach(r => { r.dataset.cur = String(r.dataset.id === P.state.curId); });
}

/* ---------- ações ---------- */
function toggleFav(id) {
  const t = byId(id);
  if (!t) return;
  t.fav = !t.fav;
  St.putTrack(metaOf(t)).catch(() => {});
  if (U.tab === 'library') { fillLib(); } else if (U.tab === 'playlists') render(true);
  renderPlayer();
}
function deleteTrack(id) {
  const t = byId(id);
  if (!t) return;
  P.stopIfCurrent(id);
  D.tracks = D.tracks.filter(x => x.id !== id);
  D.playlists.forEach(p => { p.ids = p.ids.filter(x => x !== id); });
  savePlaylists();
  St.removeTrackFiles(t).catch(() => {});
  render(true);
  toast('Faixa apagada');
}
function trackMenu(id) {
  const t = byId(id);
  if (!t) return;
  const items = [
    { label: 'Tocar', icon: 'i-play', fn: () => P.play(id, listIds.length ? listIds : [id]) },
    { label: 'Adicionar à playlist', icon: 'i-list', fn: () => pickPlaylist(id) },
    { label: t.fav ? 'Tirar das favoritas' : 'Favoritar', icon: 'i-heart', fn: () => toggleFav(id) }
  ];
  if (U.tab === 'playlists' && U.plId && U.plId !== 'fav') {
    items.push({ label: 'Remover desta playlist', icon: 'i-trash', fn: () => { const p = getPl(U.plId); p.ids = p.ids.filter(x => x !== id); savePlaylists(); render(true); } });
  }
  items.push({ label: 'Apagar da biblioteca', icon: 'i-trash', danger: true, confirm: true, fn: () => deleteTrack(id) });
  menuSheet(t.title, items);
}
async function importFiles(list) {
  const files = Array.from(list).filter(f => /^(audio|video)\//.test(f.type) || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|mp4|m4v|mov|webm|mkv)$/i.test(f.name));
  if (!files.length) { toast('Escolha arquivos de áudio ou vídeo (MP3, MP4…)'); return; }
  let ok = 0, bad = 0;
  for (const f of files) {
    const info = await DL.probeBlob(f);
    if (!info) { bad++; continue; }
    const n = parseName(f.name);
    const t = { id: uid(), title: n.title, artist: n.artist, ext: ((f.name.split('.').pop() || '') + '').toUpperCase().slice(0, 4), video: info.video, duration: info.duration, size: f.size, fav: false, added: Date.now(), storage: 'idb' };
    try { await St.putBlob(t.id, f); await St.putTrack(t); } catch (e) { bad++; continue; }
    D.tracks.unshift(t);
    ok++;
  }
  if (U.tab === 'library') fillLib();
  toast(ok ? (ok === 1 ? '1 faixa importada' : ok + ' faixas importadas') + (bad ? ', ' + bad + ' não suportada(s)' : '') : 'Formato não suportado');
}

document.addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (tab) { U.tab = tab.dataset.tab; if (U.tab !== 'playlists') U.plId = null; render(false); return; }
  const el = e.target.closest('[data-act]');
  if (!el || sheetEl.contains(el)) return;
  const act = el.dataset.act;
  const rowEl = el.closest('.row');
  const id = rowEl ? rowEl.dataset.id : null;
  switch (act) {
    case 'play': if (id === P.state.curId) { P.toggle(); } else P.play(id, listIds.slice()); break;
    case 'fav': toggleFav(id); break;
    case 'more': trackMenu(id); break;
    case 'filter': U.filter = el.dataset.f; render(true); break;
    case 'import': $('#file').click(); break;
    case 'mode': U.mode = el.dataset.m; render(true); break;
    case 'ia-open': openArchiveItem(+el.dataset.i); break;
    case 'pl-new': promptSheet('Nova playlist', 'Nome da playlist', '', 'Criar', v => { createPlaylist(v); render(true); }); break;
    case 'pl-open': U.plId = el.dataset.pl; render(false); break;
    case 'pl-back': U.plId = null; render(false); break;
    case 'pl-menu': plMenu(); break;
    case 'pl-play': if (listIds.length) { P.state.shuffle = false; P.play(listIds[0], listIds.slice()); } break;
    case 'pl-shuffle': if (listIds.length) { P.state.shuffle = true; P.play(listIds[Math.floor(Math.random() * listIds.length)], listIds.slice()); } break;
    case 'range': U.range = +el.dataset.n; render(true); break;
    case 'stats-reset': menuSheet('Zerar estatísticas', [{ label: 'Apagar todo o histórico de escuta', icon: 'i-trash', danger: true, confirm: true, fn: () => { Stats.resetStats(); render(true); toast('Estatísticas zeradas'); } }]); break;
    case 'np-open': openNp(); break;
    case 'np-close': closeNp(); break;
    case 'np-pl': if (P.state.curId) pickPlaylist(P.state.curId); break;
    case 'np-fav': if (P.state.curId) toggleFav(P.state.curId); break;
    case 'mini-play':
    case 'toggle': P.toggle(); break;
    case 'next': P.step(1, false); break;
    case 'prev': P.step(-1, false); break;
    case 'shuffle': P.toggleShuffle(); break;
    case 'repeat': P.cycleRepeat(); break;
    case 'speed': P.cycleSpeed(); break;
    default: break;
  }
});
view.addEventListener('input', e => {
  if (e.target.id === 'q') { U.q = e.target.value; fillLib(); }
  else if (e.target.id === 'lurl') U.lurl = e.target.value;
  else if (e.target.id === 'ltitle') U.ltitle = e.target.value;
});
view.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'sform') doSearch();
  else if (e.target.id === 'lform') doLink();
});
$('#file').addEventListener('change', e => { const f = e.target.files; if (f && f.length) importFiles(f); e.target.value = ''; });

/* ---------- player na tela ---------- */
const seek = $('#np-seek');
let dragSeek = false;
function openNp() { npEl.classList.add('open'); npEl.setAttribute('aria-hidden', 'false'); sizeCanvas(); }
function closeNp() { npEl.classList.remove('open'); npEl.setAttribute('aria-hidden', 'true'); }
function renderPlayer() {
  const t = byId(P.state.curId), playing = P.isPlaying();
  document.body.dataset.playing = String(playing);
  $('#mini').hidden = !t;
  if (!t) closeNp();
  const ic = '#' + (playing ? 'i-pause' : 'i-play');
  $('#mini-play-ic').innerHTML = '<use href="' + ic + '"/>';
  $('#np-play-ic').innerHTML = '<use href="' + ic + '"/>';
  $('#np-play').setAttribute('aria-label', playing ? 'Pausar' : 'Tocar');
  $('#mini-title').textContent = t ? t.title : '';
  $('#mini-artist').textContent = t ? t.artist : '';
  $('#mini-cov').innerHTML = icon(t && t.video ? 'i-film' : 'i-music');
  $('#np-title').textContent = t ? t.title : 'Nada tocando';
  $('#np-artist').textContent = t ? t.artist : 'Escolha uma faixa';
  $('#np-fav').setAttribute('aria-pressed', String(!!(t && t.fav)));
  $('#frame').dataset.kind = t && t.video ? 'video' : 'audio';
  $('#np-shuffle').setAttribute('aria-pressed', String(P.state.shuffle));
  const rp = $('#np-repeat');
  rp.dataset.mode = P.state.repeat;
  rp.setAttribute('aria-pressed', String(P.state.repeat !== 'off'));
  $('#np-speed').textContent = P.SPEEDS[P.state.speedIdx] + 'x';
  refreshCur();
}
function sizeCanvas() {
  const cv = $('#viz'), r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
  if (r.width) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
}
if ('ResizeObserver' in window) new ResizeObserver(sizeCanvas).observe($('#frame'));
window.addEventListener('resize', sizeCanvas);

seek.addEventListener('input', () => {
  dragSeek = true;
  const d = P.media.duration, p = seek.value / 1000;
  seek.style.setProperty('--p', (p * 100) + '%');
  if (d > 0 && isFinite(d)) $('#np-tcur').textContent = fmt(p * d);
});
seek.addEventListener('change', () => { P.seek(seek.value / 1000); dragSeek = false; });
$('#frame').addEventListener('click', () => { if ($('#frame').dataset.kind === 'video') P.toggle(); });

function loop(now) {
  requestAnimationFrame(loop);
  const m = P.media, d = m.duration, c = m.currentTime || 0, p = d > 0 && isFinite(d) ? c / d : 0;
  if (!$('#mini').hidden) $('#mini-bar').style.width = (p * 100) + '%';
  if (!npEl.classList.contains('open')) return;
  if (!dragSeek) {
    seek.value = Math.round(p * 1000);
    seek.style.setProperty('--p', (p * 100) + '%');
    $('#np-tcur').textContent = fmt(c);
    $('#np-tdur').textContent = fmt(isFinite(d) ? d : 0);
  }
  if ($('#frame').dataset.kind !== 'video') P.drawViz($('#viz'), now);
}

/* ---------- tema ---------- */
const root = document.documentElement;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } };
function effTheme() { return root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); }
function themeIcon() {
  const dark = effTheme() === 'dark';
  $('#theme-ic').innerHTML = '<use href="#' + (dark ? 'i-sun' : 'i-moon') + '"/>';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#05060c' : '#eef1fb';
}
$('#theme').addEventListener('click', () => {
  const n = effTheme() === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', n);
  lsSet('orbita-theme', n);
  themeIcon();
});
try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', themeIcon); } catch (e) { /* ignora */ }
const savedTheme = lsGet('orbita-theme', '');
if (savedTheme === 'dark' || savedTheme === 'light') root.setAttribute('data-theme', savedTheme);
themeIcon();

/* ---------- início ---------- */
(async function boot() {
  try {
    const tracks = await St.getTracks();
    tracks.sort((a, b) => (b.added || 0) - (a.added || 0));
    D.tracks = tracks;
    D.playlists = await St.kvGet('playlists', []);
  } catch (e) {
    toast('Não foi possível abrir a biblioteca salva');
  }
  await Stats.loadStats();
  P.init({
    getTrack: byId,
    onChange: renderPlayer,
    onError: toast,
    onDuration: (id, d, isVideo) => {
      const t = byId(id);
      if (!t) return;
      let changed = false;
      if (isFinite(d) && d > 0 && Math.abs((t.duration || 0) - d) > 0.5) { t.duration = d; changed = true; }
      if (isVideo && !t.video) { t.video = true; changed = true; }
      if (changed) { St.putTrack(metaOf(t)).catch(() => {}); renderPlayer(); }
    }
  });
  render(false);
  renderPlayer();
  sizeCanvas();
  requestAnimationFrame(loop);
})();
