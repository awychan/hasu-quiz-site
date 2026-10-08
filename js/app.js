/* 出題用サイト ─ アプリ本体（フレームワーク不使用・ビルド不要）
   フォルダ構成（回 → ジャンル → 問題）は js/loader.js が読み込み、ここは画面を組み立てる */
(function () {
  'use strict';

  const CFG = window.QUIZ_CONFIG || {};
  const L = window.QuizLoader;
  const STORE_KEY = 'hasu-quiz-progress-v2';
  const STAGE_W = 1440, STAGE_H = 810;
  const stage = document.getElementById('stage');
  const toastEl = document.getElementById('toast');
  const TIER = { 3: 'p3', 2: 'p2', 1: 'p1' };

  /* ---------------- utils ---------------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = encodeURIComponent;
  const fmt = (t) => { if (!isFinite(t) || t < 0) return '0:00'; const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
  let toastTimer = null;
  function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200); }

  /* ---------------- icons ---------------- */
  function svg(inner, size, fill) {
    const attrs = fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" ${attrs} aria-hidden="true">${inner}</svg>`;
  }
  const ICON = {
    music: (s = 15) => svg('<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>', s),
    video: (s = 15) => svg('<rect x="3" y="3" width="18" height="18" rx="2.5"></rect><path d="M8 3v18M16 3v18M3 12h18M3 7.5h5M3 16.5h5M16 7.5h5M16 16.5h5"></path>', s),
    text: (s = 15) => svg('<path d="M4 6h16M4 12h16M4 18h10"></path>', s),
    folder: (s = 15) => svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>', s),
    play: (s = 15) => svg('<path d="M7 4.5v15l12-7.5z"></path>', s, true),
    pause: (s = 15) => svg('<rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect>', s, true),
    stop: (s = 15) => svg('<rect x="5" y="5" width="14" height="14" rx="2"></rect>', s, true),
    check: (s = 15) => svg('<path d="M20 6 9 17l-5-5"></path>', s),
    eye: (s = 15) => svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>', s),
    lock: (s = 15) => svg('<rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>', s),
    home: (s = 15) => svg('<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"></path>', s),
    back: (s = 15) => svg('<path d="M19 12H5m7 7-7-7 7-7"></path>', s),
    arrow: (s = 15) => svg('<path d="M5 12h14m-7-7 7 7-7 7"></path>', s),
    refresh: (s = 15) => svg('<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"></path><path d="M3 3v5h5"></path>', s),
    wave: (s = 15) => svg('<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4"></path>', s),
    image: (s = 15) => svg('<rect x="3" y="4" width="18" height="16" rx="2.5"></rect><circle cx="9" cy="10" r="2"></circle><path d="m21 16-5-5-7 7-2-2-4 4"></path>', s),
    expand: (s = 15) => svg('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>', s),
    alert: (s = 15) => svg('<path d="M12 3 2 20h20z"></path><path d="M12 10v4M12 17.5v.5"></path>', s),
  };
  const catIcon = (g, s) => g.type === 'video' ? ICON.video(s) : g.type === 'image' ? ICON.text(s) : ICON.music(s);

  /* ---------------- 進捗の保存（回ごと） ---------------- */
  function loadState() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }
  let state = loadState();
  function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { toast('進捗を保存できませんでした'); } }
  const qState = (r, gid, key) => (((state[r] || {})[gid] || {})[key]) || {};
  function setQ(r, gid, key, patch) { state[r] = state[r] || {}; state[r][gid] = state[r][gid] || {}; state[r][gid][key] = Object.assign({}, qState(r, gid, key), patch); saveState(); }
  function resetQ(r, gid, key) { if (state[r] && state[r][gid]) { delete state[r][gid][key]; saveState(); } }
  function resetRound(r) { delete state[r]; saveState(); }

  /* ---------------- 問題モデル ---------------- */
  function items(genre) {
    if (genre.levels) {
      const out = [];
      genre.levels.forEach((lv) => lv.questions.forEach((q) => out.push({ key: q.key, id: q.id, points: lv.points, level: lv, q })));
      return out;
    }
    return (genre.questions || []).map((q) => ({ key: q.key, id: q.id, q }));
  }
  const findItem = (genre, key) => items(genre).find((i) => i.key === key);
  function isStarted(r, gid, key) {
    const s = qState(r, gid, key);
    return !!(s.done || s.answer || s.played || s.hint || (s.clips && Object.keys(s.clips).length) || (s.lyrics && Object.keys(s.lyrics).length));
  }
  function isDone(genre, key) {
    const s = qState(genre.round, genre.id, key);
    if (s.done || s.answer) return true;
    if (genre.type === 'audio') { const it = findItem(genre, key); const tiers = it ? Object.keys(it.q.clips || {}) : []; return tiers.length > 0 && tiers.every((p) => s.clips && s.clips[p]); }
    if (genre.type === 'video') return !!s.played;
    return false;
  }
  function progress(genre) {
    const list = items(genre);
    return { items: list, total: list.length, started: list.filter((i) => isStarted(genre.round, genre.id, i.key)).length };
  }
  function levelProgress(genre, lv) {
    const list = items(genre).filter((i) => i.points === lv.points);
    return { total: list.length, started: list.filter((i) => isStarted(genre.round, genre.id, i.key)).length };
  }
  const nextItem = (genre) => items(genre).find((i) => !isStarted(genre.round, genre.id, i.key));
  const scoringLabel = (g) => g.scoringLabel || (g.scoring === 'points' ? '点数方式' : '減点方式');
  function roundTotals(rd) { return rd.genres.reduce((a, g) => { const p = progress(g); a.started += p.started; a.total += p.total; return a; }, { started: 0, total: 0 }); }

  /* ---------------- 共通パーツ ---------------- */
  const chips = (g, extra = '') => `<span class="chip">${catIcon(g, 14)}${esc(g.category)}</span><span class="chip">${esc(scoringLabel(g))}</span>${extra}`;
  const hdrLeft = (title, chipsHtml) => `<div class="hdr-left"><h1 class="title">${esc(title)}</h1>${chipsHtml}</div>`;
  const pill = (label, value, ic, cls = '') => `<div class="pill"><span>${esc(label)}</span><span class="pill-val ${cls}">${ic ? ICON[ic](14) : ''}${esc(value)}</span></div>`;
  const badge = (l1, l2, value, tier, cls = '') => `<div class="badge ${tier ? TIER[tier] : ''} ${cls}"><span class="badge-lbl"><span>${esc(l1)}</span><span>${esc(l2)}</span></span><span class="badge-num">${esc(value)}</span><span class="badge-unit">点</span></div>`;
  const count = (n, total) => `<span class="count">出題済<b>${n}</b>/ ${total}</span>`;
  const roundHref = (r) => `#/${enc(r)}`;
  const genreHref = (g) => `#/${enc(g.round)}/${enc(g.id)}`;
  const qHref = (g, key) => `#/${enc(g.round)}/${enc(g.id)}/${enc(key)}`;
  const btnTop = (r) => `<a class="btn" href="${roundHref(r)}">${ICON.home()}TOPへ</a>`;
  const btnBack = (href) => `<a class="btn" href="${href}">${ICON.back()}戻る</a>`;
  const progressBar = (cls = '') => `<div class="progress ${cls}"><span class="t" data-t="cur">0:00</span><div class="bar-track"><div class="bar-fill" data-fill></div></div><span class="t" data-t="dur">0:00</span></div>`;
  const sourceLabel = (s) => s === 'list' ? '読み込み用ファイル.txt' : s === 'listing' ? 'サーバーのフォルダ一覧' : s === 'probe' ? 'フォルダを順に探索' : '—';

  function render(parts) {
    stage.innerHTML = `<header class="bar top">${parts.header}</header><main class="main ${parts.cls || ''}">${parts.main}</main><footer class="bar bottom">${parts.footer}</footer>`;
    updateProgressUI();
  }

  /* ---------------- メディア ---------------- */
  const audio = new Audio();
  let nowPlaying = null;
  const lastPlayed = {};
  let videoMode = 'q';
  let cur = { round: null, genre: null, item: null };

  function stopAudio() { audio.pause(); nowPlaying = null; }
  function stopMedia() { stopAudio(); const v = stage.querySelector('video'); if (v) v.pause(); }
  function playAudio(src, meta) {
    if (!src) { toast('音声ファイルがありません'); return; }
    audio.src = src; audio.currentTime = 0; nowPlaying = meta;
    audio.play().catch(() => { toast('再生できません: ' + decodeURIComponent(src)); nowPlaying = null; rerender(); });
  }
  audio.addEventListener('ended', () => { nowPlaying = null; rerender(); });
  audio.addEventListener('error', () => { toast('ファイルが見つかりません: ' + decodeURIComponent(audio.getAttribute('src') || '')); nowPlaying = null; rerender(); });
  ['timeupdate', 'durationchange', 'pause', 'play'].forEach((ev) => audio.addEventListener(ev, updateProgressUI));

  function activeMedia() { const v = stage.querySelector('video'); return v || (nowPlaying ? audio : null); }
  function updateProgressUI() {
    const m = activeMedia(); const fill = stage.querySelector('[data-fill]'); if (!fill) return;
    const c = m ? m.currentTime : 0, d = m && isFinite(m.duration) ? m.duration : 0;
    fill.style.width = d ? `${(c / d) * 100}%` : '0%';
    const tc = stage.querySelector('[data-t="cur"]'), td = stage.querySelector('[data-t="dur"]');
    if (tc) tc.textContent = fmt(c); if (td) td.textContent = fmt(d);
    const pauseBtn = stage.querySelector('[data-action="audio-toggle"]');
    if (pauseBtn && nowPlaying) pauseBtn.innerHTML = audio.paused ? ICON.play() + '再開' : ICON.pause() + '一時停止';
  }
  function toggleActiveMedia() {
    const v = stage.querySelector('video');
    if (v) { if (v.paused) v.play().catch(() => {}); else v.pause(); return; }
    if (nowPlaying) { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); }
  }

  /* ================= 読み込み ================= */
  let rounds = [];          // [{ name, genres, source, fileCount, error }]
  let roundsSource = null;
  let loading = false;
  const roundByName = (n) => rounds.find((r) => r.name === n);

  function renderLoading(msg) {
    render({ cls: 'center', header: `<div class="hdr-left"><span class="latin lg">${esc(CFG.event?.short || 'QUIZ')}</span><span class="event">${esc(CFG.event?.title || '')}</span></div>`,
      main: `<div class="notice"><div class="spinner"></div><h1 class="page-title">${esc(msg)}</h1><p class="muted">${esc(L.base())}/ の中の回フォルダを読んでいます</p></div>`, footer: '<span class="spacer"></span>' });
  }
  function renderEmpty() {
    render({ cls: 'center', header: `<div class="hdr-left"><span class="latin lg">${esc(CFG.event?.short || 'QUIZ')}</span><span class="event">${esc(CFG.event?.title || '')}</span></div>`,
      main: `<div class="notice"><span class="notice-icon">${ICON.alert(40)}</span><h1 class="page-title">回のフォルダが見つかりません</h1>
        <p class="muted">サイトのフォルダに <code>${esc(L.base())}/第1回/</code> のように回のフォルダを置き、その中にジャンルのフォルダ（例：<code>楽曲・音声_イントロ_減点方式</code>）と問題のフォルダを置いてください。</p>
        <p class="muted">サーバーは <code>python3 -m http.server 8765 --bind 127.0.0.1</code> で起動します。別のサーバーを使う場合は <code>scripts/make_list.py</code> で読み込み用ファイル.txt を作ってください。</p>
        <button class="btn grad" data-action="reload-all">${ICON.refresh()}もう一度読み込む</button></div>`,
      footer: '<span class="spacer"></span>' });
  }
  async function loadAll() {
    if (loading) return; loading = true;
    renderLoading('フォルダ構成を読み込んでいます…');
    try {
      const found = await L.discoverRounds();
      roundsSource = found.source;
      rounds = await Promise.all(found.rounds.map((n) => L.loadRound(n)));
      rounds = rounds.filter((r) => r.genres.length || r.error);
    } catch (e) { rounds = []; }
    loading = false;
    draw();
  }

  /* ================= 回の選択画面 ================= */
  function renderRounds() {
    if (!rounds.length) return renderEmpty();
    const firstOpen = rounds.find((r) => { const t = roundTotals(r); return t.total > 0 && t.started < t.total; });
    const cards = rounds.map((r) => {
      const t = roundTotals(r); const complete = t.total > 0 && t.started >= t.total; const isNext = firstOpen && firstOpen.name === r.name;
      const pct = t.total ? Math.round((t.started / t.total) * 100) : 0;
      const chip = r.error ? `<span class="chip">${esc(r.error)}</span>` : complete ? `<span class="chip done">${ICON.check(13)}出題済</span>` : isNext ? '<span class="chip next">次の回</span>' : !t.total ? '<span class="chip">準備中</span>' : '<span class="chip">未着手</span>';
      const inner = `<a class="card round ${complete ? 'complete' : ''}" href="${roundHref(r.name)}">${chip}<span class="round-name">${esc(r.name)}</span>
        <span class="round-sub">${r.genres.length}ジャンル ・ ${t.total}問 ・ 出題済 ${t.started} / ${t.total}</span>
        <div class="bar-track"><div class="bar-fill ${complete ? 'done' : ''}" style="width:${pct}%"></div></div></a>`;
      return isNext ? `<div class="next-wrap round-wrap">${inner}</div>` : inner;
    }).join('');
    render({
      cls: 'rounds',
      header: `<div class="hdr-left"><span class="latin lg">${esc(CFG.event?.short || 'QUIZ')}</span><span class="event">${esc(CFG.event?.title || '')}</span></div>
        ${pill('回を選択', 'フォルダから読み込み', 'folder')}<span class="count"><b>${rounds.length}</b>回分</span>`,
      main: `<div class="top-head"><div><span class="latin">ROUND SELECT</span><h1 class="page-title">第〇回を選択</h1></div><span class="hint">回のフォルダごとに1枚。出題済の記録は回ごとに別々に保存されます</span></div>
        <div class="round-grid">${cards}</div>`,
      footer: `<button class="btn ghost" data-action="reload-all">${ICON.refresh()}フォルダを再読み込み</button>
        <span class="footer-note">読み込み元：${esc(sourceLabel(roundsSource))}（${esc(L.base())}/）</span><span class="spacer"></span>
        <button class="btn ghost" data-action="fullscreen">${ICON.expand()}全画面</button>`,
    });
  }

  /* ================= TOP（ジャンル一覧） ================= */
  function renderTop(rd) {
    const totals = roundTotals(rd);
    const pct = totals.total ? Math.round((totals.started / totals.total) * 100) : 0;
    render({
      cls: 'top',
      header: `<div class="hdr-left"><span class="latin lg">${esc(CFG.event?.short || 'QUIZ')}</span><span class="event">${esc(CFG.event?.title || '')}</span></div>
        <div class="pill"><span style="display:inline-flex;align-items:center;gap:6px">${ICON.home(14)}${esc(rd.name)}</span><span class="pill-val">出題ジャンル</span></div>
        ${count(totals.started, totals.total)}`,
      main: `<div class="top-head"><div><span class="latin">GENRE SELECT</span><h1 class="page-title">出題ジャンルを選択</h1></div><span class="hint">パネルを押すと各ジャンルの出題画面へ</span></div>
        <div class="genre-grid">${rd.genres.map(genreCard).join('')}${legendCard()}</div>`,
      footer: `<a class="btn ghost" href="#/">${ICON.back()}回の選択へ</a><button class="btn ghost" data-action="reset-round">${ICON.refresh()}この回の進捗をリセット</button>
        <div class="overall"><span>全体の進捗</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span>残り ${totals.total - totals.started} 問</span></div>
        <button class="btn ghost" data-action="fullscreen">${ICON.expand()}全画面</button>
        <span class="pill-solid">${ICON.home(14)}${esc(rd.name)}</span>`,
    });
  }
  function genreCard(g) {
    const p = progress(g);
    const complete = p.total > 0 && p.started >= p.total;
    const pct = p.total ? Math.round((p.started / p.total) * 100) : 0;
    let sub;
    if (!p.total) sub = '<span class="sub">ファイル未配置</span>';
    else if (complete) sub = '<span class="sub">すべて出題済</span>';
    else if (g.levels) sub = `<div class="lv-chips">${g.levels.map((lv) => { const lp = levelProgress(g, lv); return `<span class="lv-chip ${TIER[lv.points] || 'p1'}">${lv.points}点 ${lp.started}/${lp.total}</span>`; }).join('')}</div>`;
    else sub = '<span class="sub">3点→2点→1点</span>';
    return `<a class="card genre ${complete ? 'complete' : ''}" href="${genreHref(g)}">
      <div class="card-top"><span class="cat">${catIcon(g, 15)}${esc(g.category)}</span>${complete ? `<span class="chip done">${ICON.check(13)}完了</span>` : `<span class="chip">${esc(scoringLabel(g))}</span>`}</div>
      <div class="card-name">${esc(g.name)}</div>
      <div class="card-bottom"><div class="row"><div class="num ${complete ? 'done' : ''}">${p.started}<span>/ ${p.total}</span></div>${sub}</div>
      <div class="bar-track"><div class="bar-fill ${complete ? 'done' : ''}" style="width:${pct}%"></div></div></div></a>`;
  }
  function legendCard() {
    return `<div class="card legend"><span class="latin">POINT COLORS</span>
      <div class="legend-rows">
        <div class="legend-row"><span class="swatch p3">3点</span><span>スリーズブーケ</span></div>
        <div class="legend-row"><span class="swatch p2">2点</span><span>DOLLCHESTRA</span></div>
        <div class="legend-row"><span class="swatch p1">1点</span><span>みらくらぱーく！</span></div>
      </div>
      <div class="legend-note">減点方式：3点→2点→1点と下がる<br>点数方式：初級1点／中級2点／上級3点</div></div>`;
  }

  /* ================= 2 楽曲・音声 ================= */
  function renderAudio(g) {
    const p = progress(g);
    const np = nowPlaying && nowPlaying.gid === g.id && nowPlaying.round === g.round ? nowPlaying : null;
    const last = lastPlayed[g.round + '/' + g.id];
    const curPts = np ? np.points : last ? last.points : null;
    const rows = p.items.map((it) => {
      const s = qState(g.round, g.id, it.key), clips = s.clips || {};
      const started = isStarted(g.round, g.id, it.key), done = isDone(g, it.key);
      const statusChip = done ? '<span class="chip done">出題済</span>'
        : started ? `<button class="chip playing" data-action="mark-done" data-key="${it.key}" title="出題済にする">出題中</button>` : '<span class="chip">未出題</span>';
      const resetBtn = `<button class="icon-btn" data-action="reset-q" data-key="${it.key}" data-id="${it.id}" title="問題${it.id}の記録をリセット" aria-label="問題${it.id}の記録をリセット" ${started ? '' : 'disabled'}>${ICON.refresh(14)}</button>`;
      const btns = [3, 2, 1].map((pt) => {
        const src = it.q.clips[pt];
        if (!src) return `<button class="clip missing" disabled title="ファイルがありません（_ver${4 - pt}）">${ICON.lock(15)}${pt}点問題<span class="tag">なし</span></button>`;
        const playing = np && np.key === it.key && np.points === pt;
        const played = !!clips[pt];
        const cls = playing ? `clip playing ${TIER[pt]}` : played ? 'clip played' : `clip ${TIER[pt]}`;
        const ic = playing ? (audio.paused ? ICON.pause(16) : ICON.wave(17)) : played ? ICON.check(17) : ICON.play(15);
        const tag = playing ? `<span class="tag">${audio.paused ? '一時停止' : '再生中'}</span>` : played ? '<span class="tag">済</span>' : '';
        return `<button class="${cls}" data-action="play-clip" data-key="${it.key}" data-points="${pt}">${ic}${pt}点問題${tag}</button>`;
      }).join('');
      return `<div class="qrow ${done ? 'is-done' : ''}"><div class="qlabel">問題${it.id}</div>${btns}<div class="qstatus">${statusChip}${resetBtn}</div></div>`;
    }).join('');
    render({
      cls: `audio n${Math.min(p.total, 10)}`,
      header: hdrLeft(g.name, chips(g))
        + (np ? pill(`問題${np.id}`, `${np.points}点問題 ${audio.paused ? '一時停止' : '再生中'}`, audio.paused ? 'pause' : 'wave', 'p2') : pill('待機中', 'クリップを選択'))
        + `<div class="hdr-right">${count(p.started, p.total)}${badge('現在の', '点数', curPts == null ? '—' : curPts, curPts)}</div>`,
      main: p.total ? `<section class="card list">${rows}</section>` : emptyGenre(g),
      footer: `<button class="btn outline-p2" data-action="stop" ${np ? '' : 'disabled'}>${ICON.stop()}停止</button>
        ${np ? `<button class="btn" data-action="audio-toggle">${ICON.pause()}一時停止</button>` : ''}
        <div class="nowplaying"><span class="np-icon ${np ? '' : 'idle'}">${ICON.wave(18)}</span><div class="np-text"><span class="latin">NOW PLAYING</span><span class="np-title">${np ? `問題${np.id} ・ ${np.points}点問題` : '—'}</span></div>${progressBar()}</div>
        ${btnTop(g.round)}`,
    });
  }
  function emptyGenre(g) {
    return `<div class="notice small"><span class="notice-icon">${ICON.folder(36)}</span><h2 class="page-title" style="font-size:26px">問題のフォルダがまだありません</h2><p class="muted"><code>${esc(decodeURIComponent(g.base))}/</code> の中に 第1問、第2問 …（点数方式は 初級／中級／上級）のフォルダとファイルを置いてください。</p></div>`;
  }

  /* ================= 選択画面 ================= */
  function renderRowsSelect(g) {
    const p = progress(g); const next = nextItem(g);
    const rows = p.items.map((it) => {
      const started = isStarted(g.round, g.id, it.key); const isNext = next && next.key === it.key;
      const inner = `<a class="srow ${started ? 'complete' : ''}" href="${qHref(g, it.key)}">
        <span class="name-chip"><span class="qname">問題${it.id}</span>${isNext ? '<span class="chip next">次の問題</span>' : ''}</span>
        ${started ? `<span class="chip done" style="font-size:14px;padding:8px 16px">${ICON.check(15)}出題済</span>` : `<span class="go">出題する${ICON.arrow(22)}</span>`}</a>`;
      return isNext ? `<div class="next-wrap">${inner}</div>` : inner;
    }).join('');
    render({
      header: hdrLeft(g.name, chips(g)) + pill('問題を選択', `${p.total}問`) + count(p.started, p.total),
      main: p.total ? `<div class="select-rows ${p.total > 5 ? 'dense' : ''}">${rows}</div>` : emptyGenre(g),
      footer: `<span class="spacer"></span>${btnTop(g.round)}`,
    });
  }
  function renderVideoSelect(g) {
    const p = progress(g);
    const rows = g.levels.map((lv) => {
      const cards = p.items.filter((i) => i.points === lv.points).map((it) => {
        const started = isStarted(g.round, g.id, it.key);
        return `<a class="card vq ${started ? 'complete' : ''}" href="${qHref(g, it.key)}"><span class="qname">問題${it.id}</span>
          ${started ? `<span class="chip done" style="font-size:13px;padding:7px 14px">${ICON.check(14)}出題済</span>` : `<span class="playcircle ${TIER[lv.points] || 'p1'}">${ICON.play(20)}</span>`}</a>`;
      }).join('');
      return `<div class="vrow"><div class="vlabel"><span class="lv-name">${esc(lv.label)}</span><span class="lv-pill ${TIER[lv.points] || 'p1'}"><b>${lv.points}</b>点</span></div>${cards}</div>`;
    }).join('');
    render({
      header: hdrLeft(g.name, chips(g)) + pill('問題を選択', g.levels.map((lv) => lv.label).join('・')) + count(p.started, p.total),
      main: p.total ? `<div class="vrows">${rows}</div>` : emptyGenre(g),
      footer: `<span class="spacer"></span>${btnTop(g.round)}`,
    });
  }
  function renderTextSelect(g) {
    const p = progress(g); const next = nextItem(g);
    const cards = p.items.map((it) => {
      const started = isStarted(g.round, g.id, it.key); const isNext = next && next.key === it.key;
      const chip = started ? `<span class="chip done">${ICON.check(14)}出題済</span>` : isNext ? '<span class="chip next">次の問題</span>' : '<span class="chip">未出題</span>';
      const inner = `<a class="card tq ${started ? 'complete' : ''}" href="${qHref(g, it.key)}"><span class="qname">問題${it.id}</span>${chip}</a>`;
      return isNext ? `<div class="next-wrap">${inner}</div>` : inner;
    }).join('');
    const cols = p.total <= 5 ? 5 : p.total <= 10 ? 5 : 6;
    render({
      header: hdrLeft(g.name, chips(g)) + pill('問題を選択', `${p.total}問`) + count(p.started, p.total),
      main: p.total ? `<div class="tq-grid" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr))">${cards}</div>` : emptyGenre(g),
      footer: `<span class="spacer"></span>${btnTop(g.round)}`,
    });
  }

  /* ================= 3-2 歌詞 出題画面 ================= */
  function renderLyricsQuiz(g, key) {
    const it = findItem(g, key); if (!it) return renderTop(roundByName(g.round));
    const s = qState(g.round, g.id, key), shown = s.lyrics || {}, answered = !!s.answer;
    const revealed = [3, 2, 1].filter((p) => shown[p]);
    const curPts = revealed.length ? Math.min(...revealed) : null;
    const texts = {}; let pending = false;
    [3, 2, 1].forEach((p) => { const f = it.q.lyricsFiles[p]; if (f && shown[p]) { const t = L.loadTextSync ? null : undefined; texts[p] = textCacheGet(f); if (texts[p] === undefined) pending = true; } });
    let answerText = null;
    if (answered && it.q.answerFile) { answerText = textCacheGet(it.q.answerFile); if (answerText === undefined) pending = true; }
    if (pending) ensureTexts([...Object.values(it.q.lyricsFiles), it.q.answerFile].filter(Boolean));
    const rows = [3, 2, 1].map((p) => {
      const on = !!shown[p]; const has = !!it.q.lyricsFiles[p];
      const isNext = !on && has && (p === 3 || shown[p + 1] || !it.q.lyricsFiles[p + 1]);
      const btn = !has ? `<button class="btn" disabled title="歌詞N_ver${4 - p}.txt がありません">${ICON.lock()}なし</button>`
        : on ? `<button class="btn shown" disabled>${ICON.check()}表示済</button>`
        : isNext ? `<button class="btn ${TIER[p]}-fill" data-action="show-lyric" data-points="${p}">${ICON.eye()}${p}点を表示</button>`
        : `<button class="btn" disabled>${ICON.lock()}${p}点</button>`;
      const body = on ? (texts[p] === undefined ? '<span class="muted">読み込み中…</span>' : texts[p] === null ? '<span class="muted">（ファイルを読めません）</span>' : esc(texts[p]).replace(/\n/g, '<br>')) : ICON.lock(22) + '●●●●●●●●●●●●●●●●';
      return `<div class="lrow"><span class="tier ${TIER[p]}">${p}<small>点</small></span><div class="ltext ${on ? '' : 'locked'}">${body}</div>${btn}</div>`;
    }).join('');
    const playingSong = nowPlaying && nowPlaying.gid === g.id && nowPlaying.key === key && nowPlaying.round === g.round;
    const ansBody = answered ? (it.q.answerFile ? (answerText === undefined ? '読み込み中…' : answerText === null ? '（回答N.txt を読めません）' : esc(answerText)) : '（回答N.txt がありません）') : '？？？？？？？？';
    render({
      header: hdrLeft(g.name, chips(g))
        + pill(`問題${it.id}`, answered ? '回答 表示中' : revealed.length ? `ヒント ${revealed.length} / 3 表示中` : 'ヒント未表示', 'eye', 'p2')
        + (answered ? badge('回答', '表示中', '—', null, 'ans') : badge('現在の', '点数', curPts == null ? '—' : curPts, curPts)),
      main: `<section class="card lyrics"><div class="card-head"><span class="latin">LYRICS HINT</span><span>歌詞ヒント ─ 表示するごとに点数が下がります</span></div>${rows}</section>
        <section class="answer"><span class="ans-lbl"><span class="latin red">ANSWER</span><span>回答</span></span>
          <div class="ans-text ${answered ? 'on' : ''}">${ansBody}</div>
          ${answered ? '' : `<button class="btn red lg" data-action="show-answer">${ICON.eye(18)}回答を表示</button>`}</section>`,
      footer: `${btnBack(genreHref(g))}
        <div class="nowplaying">
          ${playingSong ? `<button class="btn outline-p2" data-action="stop">${ICON.stop()}停止</button>` : `<button class="btn outline-p2" data-action="play-song" ${answered && it.q.audio ? '' : 'disabled'}>${ICON.play()}楽曲を再生</button>`}
          ${progressBar()}
          ${answered ? '' : '<span class="footer-note">回答表示後に再生</span>'}
        </div>${btnTop(g.round)}`,
    });
  }
  const textCache = new Map();
  const textCacheGet = (url) => (textCache.has(url) ? textCache.get(url) : undefined);
  async function ensureTexts(urls) {
    const todo = urls.filter((u) => !textCache.has(u) && !textCache.has('pending:' + u));
    if (!todo.length) return;
    todo.forEach((u) => textCache.set('pending:' + u, true));
    await Promise.all(todo.map(async (u) => { const t = await L.loadText(u); textCache.set(u, t); textCache.delete('pending:' + u); }));
    rerender();
  }

  /* ================= 4-2 動画 出題画面 ================= */
  function renderVideoQuiz(g, key) {
    const it = findItem(g, key); if (!it) return renderTop(roundByName(g.round));
    const src = videoMode === 'a' ? it.q.answer : it.q.question;
    const modeLabel = videoMode === 'a' ? '回答動画' : '問題動画';
    const shown = src ? decodeURIComponent(src) : (videoMode === 'a' ? '回答動画のファイルがありません（動画N_回答）' : '問題動画のファイルがありません（動画N_問題）');
    render({
      header: hdrLeft(g.name, chips(g, `<span class="chip ${TIER[it.points] || 'p1'}-soft">${esc(it.level.label)}</span>`))
        + `<div class="pill"><span>問題${it.id}</span><span class="pill-val p2" data-video-pill>${ICON.pause(14)}${modeLabel} 停止中</span></div>`
        + badge('この問題', 'の点数', it.points, it.points),
      main: `<div class="player">
          <div class="player-top"><span class="pill-solid">${ICON.video(14)}${modeLabel}</span><span class="player-note" data-note>${esc(shown)}</span></div>
          <video data-video ${src ? `src="${esc(src)}"` : ''} playsinline preload="metadata"></video>
          <div class="bigplay-wrap" data-bigplay><button class="bigplay" data-action="video-toggle" aria-label="再生">${ICON.play(38)}</button><span class="bigplay-lbl">クリックで再生</span></div>
          ${progressBar('dark')}
        </div>`,
      footer: `${btnBack(genreHref(g))}
        <div class="controls">
          <div class="controls-group"><span class="seg-label">いま流している動画</span>
            <div class="segment"><button class="${videoMode === 'q' ? 'on' : ''}" data-action="video-mode" data-mode="q">問題動画</button><button class="${videoMode === 'a' ? 'on' : ''}" data-action="video-mode" data-mode="a">回答動画</button></div></div>
          <button class="btn red lg" data-action="video-answer" ${it.q.answer ? '' : 'disabled'}>${ICON.eye(19)}回答動画を再生</button>
          <button class="btn" data-action="video-restart" ${it.q.question ? '' : 'disabled'}>${ICON.refresh(16)}問題動画を最初から</button>
        </div>${btnTop(g.round)}`,
    });
    const v = stage.querySelector('[data-video]');
    v.addEventListener('play', () => { syncVideoUI(); if (videoMode === 'q') setQ(g.round, g.id, key, { played: true }); else setQ(g.round, g.id, key, { answer: true }); });
    v.addEventListener('pause', syncVideoUI); v.addEventListener('ended', syncVideoUI);
    v.addEventListener('timeupdate', updateProgressUI); v.addEventListener('durationchange', updateProgressUI);
    v.addEventListener('error', () => { const n = stage.querySelector('[data-note]'); if (n) n.textContent = 'ファイルが見つかりません: ' + shown; toast('動画ファイルが見つかりません: ' + shown); syncVideoUI(); });
    v.addEventListener('click', () => toggleActiveMedia());
  }
  function syncVideoUI() {
    const v = stage.querySelector('[data-video]'); if (!v) return;
    const playing = !v.paused && !v.ended;
    const wrap = stage.querySelector('[data-bigplay]'); if (wrap) wrap.hidden = playing;
    const pillEl = stage.querySelector('[data-video-pill]');
    if (pillEl) pillEl.innerHTML = (playing ? ICON.play(14) : ICON.pause(14)) + (videoMode === 'a' ? '回答動画' : '問題動画') + (playing ? ' 再生中' : ' 停止中');
    updateProgressUI();
  }
  function startVideo() { const v = stage.querySelector('[data-video]'); if (v && v.getAttribute('src')) v.play().catch(() => toast('動画を再生できません')); }

  /* ================= 5-2 文章（1枚絵） ================= */
  function renderTextQuiz(g, key) {
    const it = findItem(g, key); if (!it) return renderTop(roundByName(g.round));
    const s = qState(g.round, g.id, key);
    const step = s.answer ? 3 : (s.hint || 0);
    const pts = step === 0 ? 3 : step === 1 ? 2 : step === 2 ? 1 : null;
    const im = it.q.images || {};
    const layers = [im.question, step >= 1 && im.hint1, step >= 2 && im.hint2, step >= 3 && im.answer].filter(Boolean);
    const stateLabel = step === 0 ? '問題のみ表示中' : step === 3 ? '回答 表示中' : `ヒント${step} まで表示中`;
    const hintBtn = (n, nextPts, file) => {
      if (!file) return `<button class="btn" disabled title="画像N_ver${n + 1}.png がありません">${ICON.lock()}ヒント${n}<span class="tag">なし</span></button>`;
      if (step >= n) return `<button class="btn shown" disabled>${ICON.check()}ヒント${n}<span class="tag">表示済 ・ ${nextPts}点</span></button>`;
      if (step === n - 1 && step < 3) return `<button class="btn next" data-action="show-hint" data-hint="${n}">${ICON.eye()}ヒント${n}<span class="tag white">→ ${nextPts}点</span></button>`;
      return `<button class="btn" disabled>${ICON.lock()}ヒント${n}<span class="tag">→ ${nextPts}点</span></button>`;
    };
    const seqCls = (n) => step === n ? 'on' : '';
    render({
      header: hdrLeft(g.name, chips(g)) + pill(`問題${it.id}`, stateLabel, 'eye', 'p2')
        + (step === 3 ? badge('回答', '表示中', '—', null, 'ans') : badge('現在の', '点数', pts, pts)),
      main: `<div class="imgbox">
          <div class="imgbox-top"><span class="pill-solid">${ICON.eye(14)}${stateLabel}</span><span class="note">${esc(decodeURIComponent(layers[layers.length - 1] || ''))}</span></div>
          <div class="imgstack"><div class="placeholder">${ICON.image(72)}<span class="ph-title">${im.question ? '画像を読み込めません' : '問題画像がありません'}</span><span class="ph-sub">${esc(decodeURIComponent(im.question || `${g.base}/第${it.id}問/画像${it.id}_ver1.png`))}</span></div>
            ${layers.map((src) => `<img class="layer" src="${esc(src)}" alt="" onerror="this.classList.add('missing')">`).join('')}</div>
          <div class="imgbox-bottom"><span>推奨：1920×1080 以上、横長</span></div>
        </div>`,
      footer: `${btnBack(genreHref(g))}
        <div class="controls">
          <div class="seq"><span class="s p3 ${seqCls(0)}">3点</span>→<span class="s p2 ${seqCls(1)}">2点</span>→<span class="s p1 ${seqCls(2)}">1点</span>→<span class="s ans ${seqCls(3)}">回答</span></div>
          <div class="hint-btns">${hintBtn(1, 2, im.hint1)}${hintBtn(2, 1, im.hint2)}
            ${step === 3 ? `<button class="btn shown" disabled>${ICON.check()}回答 表示済</button>` : `<button class="btn red" data-action="show-text-answer" ${im.answer ? '' : 'title="画像N_回答.png がありません"'}>${ICON.eye()}回答を表示<span class="tag white" style="color:#BE1400">ヒント3</span></button>`}
          </div>
        </div>${btnTop(g.round)}`,
    });
  }

  /* ---------------- ルーティング ---------------- */
  function parseHash() { return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch (e) { return s; } }); }
  function draw() {
    if (loading) return;
    const [rname, gid, key] = parseHash();
    const rd = rname ? roundByName(rname) : null;
    cur = { round: rd ? rd.name : null, genre: null, item: null };
    if (!rd) { if (rname && rounds.length) toast(`「${rname}」のフォルダが見つかりません`); return renderRounds(); }
    const genre = gid ? rd.genres.find((g) => g.id === gid) : null;
    if (!genre) return renderTop(rd);
    cur.genre = genre;
    if (key) cur.item = findItem(genre, key);
    switch (genre.type) {
      case 'audio': return renderAudio(genre);
      case 'lyrics': return key && cur.item ? renderLyricsQuiz(genre, key) : renderRowsSelect(genre);
      case 'video': return key && cur.item ? renderVideoQuiz(genre, key) : renderVideoSelect(genre);
      case 'image': return key && cur.item ? renderTextQuiz(genre, key) : renderTextSelect(genre);
      default: return renderTop(rd);
    }
  }
  function route() { stopMedia(); videoMode = 'q'; draw(); window.scrollTo(0, 0); }
  function rerender() { draw(); }

  /* ---------------- 操作 ---------------- */
  stage.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const r = cur.round, g = cur.genre, it = cur.item;
    const action = el.dataset.action;
    switch (action) {
      case 'reload-all': loadAll(); break;
      case 'reset-round':
        if (confirm(`${r} のすべての進捗（出題済の記録）をリセットしますか？`)) { resetRound(r); toast(`${r} の進捗をリセットしました`); rerender(); }
        break;
      case 'fullscreen':
        if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => toast('全画面にできません'));
        break;
      case 'play-clip': {
        const item = findItem(g, el.dataset.key), pt = Number(el.dataset.points);
        if (!item) break;
        if (nowPlaying && nowPlaying.key === item.key && nowPlaying.points === pt && nowPlaying.gid === g.id && nowPlaying.round === r) { toggleActiveMedia(); rerender(); break; }
        const meta = { round: r, gid: g.id, key: item.key, id: item.id, points: pt };
        lastPlayed[r + '/' + g.id] = meta;
        setQ(r, g.id, item.key, { clips: Object.assign({}, qState(r, g.id, item.key).clips, { [pt]: true }) });
        playAudio(item.q.clips[pt], meta);
        rerender();
        break;
      }
      case 'stop': stopAudio(); rerender(); break;
      case 'audio-toggle': toggleActiveMedia(); rerender(); break;
      case 'mark-done': setQ(r, g.id, el.dataset.key, { done: true }); rerender(); break;
      case 'reset-q':
        if (confirm(`問題${el.dataset.id || el.dataset.key.replace(/^q/, '')} の記録（済・出題中）をリセットしますか？`)) { if (nowPlaying && nowPlaying.key === el.dataset.key) stopAudio(); resetQ(r, g.id, el.dataset.key); toast(`問題${el.dataset.id || ''} をリセットしました`); rerender(); }
        break;
      case 'show-lyric': setQ(r, g.id, it.key, { lyrics: Object.assign({}, qState(r, g.id, it.key).lyrics, { [el.dataset.points]: true }) }); rerender(); break;
      case 'show-answer': setQ(r, g.id, it.key, { answer: true }); rerender(); break;
      case 'play-song': playAudio(it.q.audio, { round: r, gid: g.id, key: it.key, id: it.id, points: null }); rerender(); break;
      case 'video-toggle': toggleActiveMedia(); break;
      case 'video-mode':
        if (el.dataset.mode !== videoMode) { videoMode = el.dataset.mode; renderVideoQuiz(g, it.key); }
        break;
      case 'video-answer':
        if (videoMode !== 'a') { videoMode = 'a'; renderVideoQuiz(g, it.key); }
        startVideo();
        break;
      case 'video-restart':
        if (videoMode !== 'q') { videoMode = 'q'; renderVideoQuiz(g, it.key); }
        { const v = stage.querySelector('[data-video]'); if (v) v.currentTime = 0; }
        startVideo();
        break;
      case 'show-hint': setQ(r, g.id, it.key, { hint: Number(el.dataset.hint) }); rerender(); break;
      case 'show-text-answer': setQ(r, g.id, it.key, { answer: true }); rerender(); break;
    }
    if (el.blur) el.blur();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); toggleActiveMedia(); if (cur.genre && cur.genre.type !== 'video') rerender(); }
    else if (e.key === 'Escape') { if (cur.round) location.hash = cur.genre ? roundHref(cur.round) : '#/'; }
  });

  /* ---------------- 画面サイズに合わせて拡大縮小 ---------------- */
  function fitStage() {
    const w = window.innerWidth || document.documentElement.clientWidth;
    const h = window.innerHeight || document.documentElement.clientHeight;
    if (!w || !h) return;
    const s = Math.min(w / STAGE_W, h / STAGE_H);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  window.addEventListener('resize', fitStage);
  window.addEventListener('load', fitStage);
  document.addEventListener('visibilitychange', fitStage);
  if (window.ResizeObserver) new ResizeObserver(fitStage).observe(document.documentElement);
  window.addEventListener('hashchange', route);
  fitStage();
  requestAnimationFrame(fitStage);
  loadAll();
})();
