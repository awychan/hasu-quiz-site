/* 出題用サイト ─ アプリ本体（フレームワーク不使用・ビルド不要）
   フォルダ構成（回 → ジャンル → 問題）は js/loader.js（v3）が読み込み、進捗は js/progress.js、ここは画面を組み立てる。
   画面は問題ごとの q.mode で選ぶ：pair → 動画プレイヤー、staged → 段階ヒント、clips → 逆転（番号付き格子） */
(function () {
  'use strict';

  const CFG = window.QUIZ_CONFIG || {};
  const L = window.QuizLoader;
  const P = window.QuizProgress;
  const TIER_POINTS = Array.isArray(CFG.tierPoints) && CFG.tierPoints.length ? CFG.tierPoints : [5, 2, 1];
  const LEVELS = CFG.levels || { 上級: 1, 中級: 2, 初級: 3 };
  const STAGE_W = 1440, STAGE_H = 810;
  const stage = document.getElementById('stage');
  const toastEl = document.getElementById('toast');

  /* ---------------- utils ---------------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = encodeURIComponent;
  const fmt = (t) => { if (!isFinite(t) || t < 0) return '0:00'; const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
  let toastTimer = null;
  function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3600); }
  const fileName = (src) => { const last = String(src || '').split('/').pop(); try { return decodeURIComponent(last); } catch (e) { return last; } };
  // 読み込めなかったときのトースト。ファイル名は答えが分かるので投影せず、コンソールにだけ出す
  const fileErr = (src, what) => {
    if (src) console.warn('読み込めません:', fileName(src));
    return `${what ? `${what}を` : ''}読み込めません（Drive 未ダウンロードの可能性）`;
  };
  // 段階番号 → ①…⑳、㉑…㉟
  const circled = (n) => (n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : n >= 21 && n <= 35 ? String.fromCharCode(0x3251 + n - 21) : `(${n})`);
  const circledNum = (ch) => { const c = ch.charCodeAt(0); return c >= 0x2460 && c <= 0x2473 ? c - 0x2460 + 1 : c >= 0x3251 && c <= 0x325F ? c - 0x3251 + 21 : null; };
  // 色は点数ではなく階級の順位で決める：1 = ロゼ、2 = ブルー、3 = イエロー、それ以外 = 無彩色
  const tierClass = (rank) => (rank === 1 ? 'p3' : rank === 2 ? 'p2' : rank === 3 ? 'p1' : 'p0');
  const levelName = (rank) => Object.keys(LEVELS).find((k) => LEVELS[k] === rank) || '';
  const groupName = (g) => String(g || '').split('/').map((p) => p.replace(/^\d+[_ 　-]/, '')).join(' / ');

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
    eyeOff: (s = 15) => svg('<path d="M3 3l18 18"></path><path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>', s),
    lock: (s = 15) => svg('<rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>', s),
    home: (s = 15) => svg('<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"></path>', s),
    back: (s = 15) => svg('<path d="M19 12H5m7 7-7-7 7-7"></path>', s),
    arrow: (s = 15) => svg('<path d="M5 12h14m-7-7 7 7-7 7"></path>', s),
    refresh: (s = 15) => svg('<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"></path><path d="M3 3v5h5"></path>', s),
    undo: (s = 15) => svg('<path d="M9 14 4 9l5-5"></path><path d="M4 9h11a5 5 0 0 1 0 10h-3"></path>', s),
    wave: (s = 15) => svg('<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4"></path>', s),
    image: (s = 15) => svg('<rect x="3" y="4" width="18" height="16" rx="2.5"></rect><circle cx="9" cy="10" r="2"></circle><path d="m21 16-5-5-7 7-2-2-4 4"></path>', s),
    expand: (s = 15) => svg('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>', s),
    alert: (s = 15) => svg('<path d="M12 3 2 20h20z"></path><path d="M12 10v4M12 17.5v.5"></path>', s),
    list: (s = 15) => svg('<path d="M9 6h11M9 12h11M9 18h11"></path><path d="M4 6h.01M4 12h.01M4 18h.01"></path>', s),
    close: (s = 15) => svg('<path d="M6 6l12 12M18 6 6 18"></path>', s),
  };
  const fmtIcon = (f, s) => (f === 'video' ? ICON.video(s) : f === 'audio' ? ICON.music(s) : f === 'text' ? ICON.text(s) : ICON.image(s));
  const catIcon = (g, s) => { const t = g.type === 'mixed' || !g.type ? g.majorFormat : g.type; return t === 'video' ? ICON.video(s) : t === 'image' ? ICON.text(s) : ICON.music(s); };

  /* ---------------- 進捗（js/progress.js） ---------------- */
  P.load();
  const qst = (g, q) => P.get(g.round, g.id, q.key);
  const shownNs = (q, st) => q.stages.map((s) => s.n).filter((n) => st.stages[n]);
  const scoringLabel = (x) => x.scoringLabel || (x.scoring === 'points' ? '点数方式' : '減点方式');
  // 段階 n の点数と色（減点：段階の順位、点数方式：級の順位。点数方式は段階ボタンに点数を出さない）
  const stagePoints = (q, n) => (q.scoring === 'points' ? q.pointsValue : (q.points && q.points[n - 1] != null ? q.points[n - 1] : null));
  const stageRank = (q, n) => (q.scoring === 'points' ? q.tierRank : n);
  // 段階の呼び名：1 段階だけの問題は「問題①」、それ以外は「ヒント①」（3a）
  const stageName = (q, n) => `${q && q.stages && q.stages.length === 1 ? '問題' : 'ヒント'}${circled(n)}`;
  const stageSeq = (q) => { const ns = q.stages.map((s) => circled(s.n)); return ns.length > 5 ? `${ns.slice(0, 3).join('→')}→…→${ns[ns.length - 1]}` : ns.join('→'); };
  function roundTotals(rd) { return rd.genres.reduce((a, g) => { a.started += P.countStarted(g); a.total += g.questions.length; return a; }, { started: 0, total: 0 }); }
  const findQ = (g, key) => (g.questions || []).find((q) => q.key === key) || null;
  // 逆転はクリップを流すか答えを開いたら出題済（それ以外は解答を出したか手動で済）
  const qDone = (st, q) => (q.mode === 'clips' ? P.isStarted(st) : P.isDone(st, q));
  const nextQ = (g) => g.questions.find((q) => !P.isStarted(qst(g, q)));
  // 音声の一覧型（仕様書タブ2）：ジャンル内の全問題が「段階・音声・減点・3 段階以下」のとき
  const isAudioList = (g) => g.questions.length > 0 && g.questions.every((q) => q.mode === 'staged' && q.format === 'audio' && q.scoring === 'deduct' && q.stages.length <= 3);

  /* ---------------- 共通パーツ ---------------- */
  const chip = (text, cls = '') => `<span class="chip ${cls}">${text}</span>`;
  const genreChips = (g) => chip(catIcon(g, 14) + esc(g.category)) + chip(esc(scoringLabel(g)));
  const levelChip = (q) => (q.level ? chip(esc(q.level.label), `${tierClass(q.level.rank)}-soft`) : '');
  const hdrLeft = (title, chipsHtml) => `<div class="hdr-left"><h1 class="title">${esc(title)}</h1>${chipsHtml}</div>`;
  const quizHead = (g, q, chipsHtml) => `<div class="hdr-left"><div class="hdr-stack"><span class="event">${esc(g.name)}</span><h1 class="title">${esc(q.label)}</h1></div>${chipsHtml}</div>`;
  const pill = (label, value, ic, cls = '', attr = '') => `<div class="pill"><span>${esc(label)}</span><span class="pill-val ${cls}" ${attr}>${ic ? ICON[ic](14) : ''}${value}</span></div>`;
  const badge = (l1, l2, value, rank, cls = '') => `<div class="badge ${rank != null ? tierClass(rank) : ''} ${cls}"><span class="badge-lbl"><span>${esc(l1)}</span><span>${esc(l2)}</span></span><span class="badge-num">${esc(value)}</span><span class="badge-unit">点</span></div>`;
  const count = (n, total, word = '出題済') => `<span class="count">${esc(word)}<b>${n}</b>/ ${total}</span>`;
  const roundHref = (r) => `#/${enc(r)}`;
  const genreHref = (g) => `#/${enc(g.round)}/${enc(g.id)}`;
  const qHref = (g, key) => `#/${enc(g.round)}/${enc(g.id)}/${enc(key)}`;
  const btnTop = (r) => `<a class="btn" href="${roundHref(r)}">${ICON.home()}TOPへ</a>`;
  const btnBack = (href) => `<a class="btn" href="${href}">${ICON.back()}戻る</a>`;
  const progressBar = (cls = '') => `<div class="progress ${cls}"><span class="t" data-t="cur">0:00</span><div class="bar-track"><div class="bar-fill" data-fill></div></div><span class="t" data-t="dur">0:00</span></div>`;
  const sourceLabel = (s) => (s === 'list' ? '読み込み用ファイル.txt' : s === 'listing' ? 'サーバーのフォルダ一覧' : s === 'probe' ? 'フォルダを順に探索' : '—');
  const stageCountText = (q) => (q.mode === 'pair' ? '動画' : q.mode === 'clips' ? `${q.stages.length}クリップ` : `ヒント${q.stages.length}段階`);

  function render(parts) {
    stage.innerHTML = `<header class="bar top">${parts.header}</header><main class="main ${parts.cls || ''}">${parts.main}</main><footer class="bar bottom ${parts.footCls || ''}">${parts.footer}</footer>${parts.overlay || ''}`;
    updateProgressUI();
  }

  /* ---------------- テキスト（メモ txt）の読み込み：描いた後に中身だけ差し込む ---------------- */
  const texts = new Map();
  const pendingTexts = new Set();
  function textOf(url) {
    if (!url) return null;
    if (texts.has(url)) return texts.get(url);
    if (!pendingTexts.has(url)) {
      pendingTexts.add(url);
      L.loadText(url).then((t) => { texts.set(url, t); pendingTexts.delete(url); fillTexts(url); });
    }
    return undefined;
  }
  function noteLines(t) {
    const map = {};
    String(t || '').split(/\r?\n/).forEach((line) => {
      const m = line.trim().match(/^([①-⑳㉑-㉟])[\s　:：.、．]*(.*)$/);
      if (m) map[circledNum(m[1])] = m[2];
    });
    return map;
  }
  const firstLine = (t) => (String(t || '').split(/\r?\n/).map((s) => s.trim()).find((s) => s && !circledNum(s[0])) || '');
  function textPart(t, part) {
    if (t === undefined) return '<span class="muted">読み込み中…</span>';
    if (t === null) return '<span class="muted">（メモを読めません）</span>';
    if (part === 'first') return esc(firstLine(t));
    const m = /^clip:(\d+)$/.exec(part || '');
    if (m) { const line = noteLines(t)[Number(m[1])]; return line != null ? esc(line) : esc(t).replace(/\n/g, '<br>'); }
    return esc(t).replace(/\n/g, '<br>');
  }
  const textSpan = (url, part, cls = '') => `<span class="${cls}" data-text-src="${esc(url)}" data-text-part="${esc(part)}">${textPart(textOf(url), part)}</span>`;
  function fillTexts(url) {
    stage.querySelectorAll('[data-text-src]').forEach((el) => { if (el.dataset.textSrc === url) el.innerHTML = textPart(texts.get(url), el.dataset.textPart); });
  }
  // 解答の文字：メモのファイル名（q.answer.text）、無ければメモの中身
  function answerTextHtml(q, cls = '') {
    if (q.answer.text) return `<span class="${cls}">${esc(q.answer.text)}</span>`;
    if (q.answer.textSrc) return textSpan(q.answer.textSrc, 'all', cls);
    return '';
  }

  /* ---------------- メディア ---------------- */
  const audio = new Audio();
  let nowPlaying = null;            // { round, gid, key, n, label, points, rank }
  const lastPlayed = {};            // ジャンルごとに最後に流した段階（一覧型の「現在の点数」）
  const clipPlayed = new Set();     // 逆転：このセッションで流したクリップ
  let videoMode = 'q';              // 対動画：'q' 問題動画 / 'a' 回答動画
  let subView = 'stages';           // 段階ヒント画面：'stages' / 'video'（解答動画）
  let showReport = false;
  let scrollFocus = false;
  let cur = { round: null, genre: null, q: null };

  const videoOnStage = () => stage.querySelector('[data-video]');
  // 音声の終了・エラーで画面を描き直す。<video> が出ている間は描き直さない（動画が消えるため）
  function refresh() { if (videoOnStage()) updateProgressUI(); else rerender(); }
  function stopAudio() { audio.pause(); nowPlaying = null; }
  function stopMedia() { stopAudio(); const v = videoOnStage(); if (v) v.pause(); }
  function playAudio(src, meta) {
    if (!src) { toast('音声ファイルがありません'); return; }
    audio.src = src; audio.currentTime = 0; nowPlaying = meta;
    audio.play().catch((err) => {
      if (err && err.name === 'AbortError') return;          // 次の再生に切り替えた
      if (err && err.name === 'NotAllowedError') toast('再生できません（ブラウザが自動再生を止めました）');
      nowPlaying = null; refresh();
    });
  }
  const npIs = (g, key, n) => !!(nowPlaying && nowPlaying.round === g.round && nowPlaying.gid === g.id && nowPlaying.key === key && (n === undefined || nowPlaying.n === n));
  audio.addEventListener('ended', () => { nowPlaying = null; refresh(); });
  audio.addEventListener('error', () => { const src = audio.getAttribute('src'); if (!src) return; toast(fileErr(src, nowPlaying && nowPlaying.what)); nowPlaying = null; refresh(); });
  ['timeupdate', 'durationchange', 'pause', 'play'].forEach((ev) => audio.addEventListener(ev, updateProgressUI));

  function activeMedia() { const v = videoOnStage(); return v || (nowPlaying ? audio : null); }
  function updateProgressUI() {
    const m = activeMedia(); const fill = stage.querySelector('[data-fill]'); if (!fill) return;
    const c = m ? m.currentTime : 0, d = m && isFinite(m.duration) ? m.duration : 0;
    fill.style.width = d ? `${(c / d) * 100}%` : '0%';
    const tc = stage.querySelector('[data-t="cur"]'), td = stage.querySelector('[data-t="dur"]');
    if (tc) tc.textContent = fmt(c); if (td) td.textContent = fmt(d);
    const pauseBtn = stage.querySelector('[data-action="audio-toggle"]');
    if (pauseBtn && nowPlaying) pauseBtn.innerHTML = audio.paused ? ICON.play() + '再開' : ICON.pause() + '一時停止';
  }
  const videoWhat = () => stage.querySelector('[data-player]')?.dataset.what || '動画';
  function toggleVideo() { const v = videoOnStage(); if (!v || !v.getAttribute('src')) return; if (v.paused || v.ended) v.play().catch((err) => { if (!err || err.name !== 'AbortError') toast(fileErr(v.getAttribute('src'), videoWhat())); }); else v.pause(); }
  function toggleAudio() { if (!nowPlaying) return; if (audio.paused) audio.play().catch(() => {}); else audio.pause(); }

  // NOW PLAYING（停止・一時停止・題・進み具合）
  function npBlock(np, opts = {}) {
    return `<button class="btn outline-p2" data-action="stop" ${np ? '' : 'disabled'}>${ICON.stop()}停止</button>
      ${np && !opts.noToggle ? `<button class="btn" data-action="audio-toggle">${audio.paused ? ICON.play() + '再開' : ICON.pause() + '一時停止'}</button>` : ''}
      <div class="nowplaying"><span class="np-icon ${np ? '' : 'idle'}">${ICON.wave(18)}</span><div class="np-text"><span class="latin">NOW PLAYING</span><span class="np-title">${np ? esc(np.label) : '—'}</span></div>${progressBar()}</div>`;
  }

  /* ---------------- 動画プレイヤー（対動画・段階ヒントの解答動画で共通） ---------------- */
  function playerView({ src, label, points, rank, note }) {
    return `<div class="player" data-player data-what="${esc(label)}">
        <div class="player-top"><span class="pill-solid" data-player-label>${ICON.video(14)}${esc(label)}</span>
          <span class="player-note" data-note>${note || (src ? '' : 'ファイルがありません')}</span>
          ${points != null ? `<span class="chip ${tierClass(rank)}-soft player-pts">${esc(points)}点</span>` : ''}</div>
        <video data-video ${src ? `src="${esc(src)}"` : ''} playsinline preload="metadata"></video>
        <div class="bigplay-wrap" data-bigplay><button class="bigplay" data-action="video-toggle" aria-label="再生"><span class="bigplay-circle">${ICON.play(38)}</span><span class="bigplay-lbl" data-bigplay-lbl>${esc(label)}を再生</span></button></div>
        ${progressBar('dark')}
      </div>`;
  }
  function wirePlayer(onPlay, pillWord) {
    const v = videoOnStage(); if (!v) return;
    v.addEventListener('play', () => { syncVideoUI(pillWord); if (onPlay) onPlay(); });
    v.addEventListener('pause', () => syncVideoUI(pillWord)); v.addEventListener('ended', () => syncVideoUI(pillWord));
    v.addEventListener('timeupdate', updateProgressUI); v.addEventListener('durationchange', updateProgressUI);
    v.addEventListener('error', () => {
      const src = v.getAttribute('src'); if (!src) return;
      const n = stage.querySelector('[data-note]'); if (n) n.textContent = 'ファイルを読み込めません';
      toast(fileErr(src, videoWhat())); syncVideoUI(pillWord);
    });
    v.addEventListener('click', toggleVideo);
    syncVideoUI(pillWord);
  }
  function syncVideoUI(pillWord) {
    const v = videoOnStage(); if (!v) return;
    const playing = !v.paused && !v.ended;
    const wrap = stage.querySelector('[data-bigplay]'); if (wrap) wrap.hidden = playing;
    stage.querySelector('[data-player]')?.classList.toggle('is-playing', playing);
    const pillEl = stage.querySelector('[data-video-pill]');
    const word = typeof pillWord === 'function' ? pillWord() : (pillWord || '');
    if (pillEl) pillEl.innerHTML = (playing ? ICON.play(14) : ICON.pause(14)) + esc(word) + (playing ? ' 再生中' : ' 停止中');
    updateProgressUI();
  }
  // クリックの中で呼ぶ（自動再生の制限）
  function startVideo(fromStart) {
    const v = videoOnStage(); if (!v || !v.getAttribute('src')) return;
    if (fromStart) v.currentTime = 0;
    v.play().catch((err) => { if (!err || err.name !== 'AbortError') toast(fileErr(v.getAttribute('src'), videoWhat())); });
  }

  /* ================= 読み込み ================= */
  let rounds = [];
  let roundsSource = null;
  let loading = false;
  const roundByName = (n) => rounds.find((r) => r.name === n);
  const eventHead = () => `<div class="hdr-left"><span class="latin lg">${esc(CFG.event?.short || 'QUIZ')}</span><span class="event">${esc(CFG.event?.title || '')}</span></div>`;

  function renderLoading(msg) {
    render({ cls: 'center', header: eventHead(),
      main: `<div class="notice"><div class="spinner"></div><h1 class="page-title">${esc(msg)}</h1><p class="muted">${esc(L.base())}/ の中の回フォルダを読んでいます</p></div>`, footer: '<span class="spacer"></span>' });
  }
  function renderEmpty() {
    const info = L.baseInfo ? L.baseInfo() : { tried: [] };
    const tried = (info.tried || []).map((t) => `<code>${esc(t.base)}/</code> ${t.ok ? '読めました' : esc(t.reason || '読めません')}`).join('<br>');
    render({ cls: 'center', header: eventHead(),
      main: `<div class="notice"><span class="notice-icon">${ICON.alert(40)}</span><h1 class="page-title">回のフォルダが見つかりません</h1>
        <p class="muted">サイトのフォルダに <code>${esc(L.base())}/第1回/</code> のように回のフォルダを置き、その中にジャンルのフォルダ（例：<code>楽曲・音声_イントロ_減点方式</code>）と問題のフォルダを置いてください。</p>
        ${tried ? `<p class="muted">${tried}</p>` : ''}
        <p class="muted">サーバーは <code>python3 scripts/serve.py</code>（または <code>python3 -m http.server 8765 --bind 127.0.0.1</code>）で起動します。</p>
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
    // v2 から移した対動画の記録を、読み込んだ問題に合わせて振り直す（js/progress.js）
    let dropped = 0;
    rounds.forEach((rd) => rd.genres.forEach((g) => { dropped += P.resolveV2Pairs(g).dropped; }));
    loading = false;
    draw();
    if (dropped) toast(`前の版の動画の問題の記録 ${dropped} 件は、対応する問題が見つからず引き継げませんでした`);
    else if (P.migratedFromV2()) toast('前の版の進捗（出題済の記録）を引き継ぎました');
  }

  /* ================= 回の選択画面 ================= */
  function renderRounds() {
    if (!rounds.length) return renderEmpty();
    const firstOpen = rounds.find((r) => { const t = roundTotals(r); return t.total > 0 && t.started < t.total; });
    const cards = rounds.map((r) => {
      const t = roundTotals(r); const complete = t.total > 0 && t.started >= t.total; const isNext = firstOpen && firstOpen.name === r.name;
      const pct = t.total ? Math.round((t.started / t.total) * 100) : 0;
      const c = r.error ? chip(esc(r.error)) : complete ? chip(ICON.check(13) + '出題済', 'done') : isNext ? chip('次の回', 'next') : !t.total ? chip('準備中') : chip('未着手');
      const inner = `<a class="card round ${complete ? 'complete' : ''}" href="${roundHref(r.name)}">${c}<span class="round-name">${esc(r.name)}</span>
        <span class="round-sub">${r.genres.length}ジャンル ・ ${t.total}問 ・ 出題済 ${t.started} / ${t.total}</span>
        <div class="bar-track"><div class="bar-fill ${complete ? 'done' : ''}" style="width:${pct}%"></div></div></a>`;
      return isNext ? `<div class="next-wrap round-wrap">${inner}</div>` : inner;
    }).join('');
    render({
      cls: 'rounds',
      header: `${eventHead()}${pill('回を選択', 'フォルダから読み込み', 'folder')}<span class="count"><b>${rounds.length}</b>回分</span>`,
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
      header: `${eventHead()}
        <div class="pill"><span style="display:inline-flex;align-items:center;gap:6px">${ICON.home(14)}${esc(rd.name)}</span><span class="pill-val">出題ジャンル</span></div>
        ${count(totals.started, totals.total)}`,
      main: `<div class="top-head"><div><span class="latin">GENRE SELECT</span><h1 class="page-title">出題ジャンルを選択</h1></div><span class="hint">パネルを押すと各ジャンルの出題画面へ</span></div>
        <div class="genre-grid">${rd.genres.map(genreCard).join('')}${legendCard()}</div>`,
      footer: `<a class="btn ghost" href="#/">${ICON.back()}回の選択へ</a>
        <button class="btn ghost" data-action="reset-round">${ICON.refresh()}進捗をリセット</button>
        <button class="btn ghost ${showReport ? 'on' : ''}" data-action="toggle-report">${ICON.list()}読み込みレポート${rd.warnings && rd.warnings.length ? `<span class="tag">${rd.warnings.length}</span>` : ''}</button>
        <div class="overall"><span>全体の進捗</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span>残り ${totals.total - totals.started} 問</span></div>
        <button class="btn ghost" data-action="reload-all">${ICON.refresh()}再読み込み</button>
        <button class="btn ghost" data-action="fullscreen">${ICON.expand()}全画面</button>`,
      overlay: showReport ? reportPanel(rd) : '',
    });
  }
  function genreCard(g) {
    const total = g.questions.length, started = P.countStarted(g);
    const complete = total > 0 && started >= total;
    const pct = total ? Math.round((started / total) * 100) : 0;
    const qs = g.questions;
    const clips = qs.filter((q) => q.mode === 'clips').length;
    const deduct = qs.filter((q) => q.scoring === 'deduct' && q.mode !== 'clips').length;
    const byRank = {};
    qs.forEach((q) => { if (q.scoring === 'points' && q.mode !== 'clips') { const k = q.tierRank || 0; byRank[k] = (byRank[k] || 0) + 1; } });
    const ranks = Object.keys(byRank).map(Number).sort((a, b) => (a || 99) - (b || 99));
    const sum = [];
    if (deduct) sum.push(chip(`減点 ${deduct}問`, 'sm'));
    if (ranks.length) sum.push(`<span class="lv-chips"><span class="chip sm">点数</span>${ranks.map((rk) => `<span class="lv-chip ${tierClass(rk)}">${esc(rk ? levelName(rk) || `${rk}位` : '級なし')} ${byRank[rk]}</span>`).join('')}</span>`);
    if (clips) sum.push(chip(`逆転 ${clips}`, 'sm'));
    return `<a class="card genre ${complete ? 'complete' : ''}" href="${genreHref(g)}">
      <div class="card-top"><span class="cat">${catIcon(g, 15)}${esc(g.category)}</span>${complete ? chip(ICON.check(13) + '完了', 'done') : chip(esc(scoringLabel(g)))}</div>
      <div class="card-name">${esc(g.name)}</div>
      <div class="card-bottom"><div class="sum-chips">${sum.join('')}</div>
        <div class="row"><div class="num ${complete ? 'done' : ''}">${started}<span>/ ${total}</span></div><span class="sub">出題済</span></div>
        <div class="bar-track"><div class="bar-fill ${complete ? 'done' : ''}" style="width:${pct}%"></div></div></div></a>`;
  }
  function legendCard() {
    const tp = (rk) => (TIER_POINTS[rk - 1] != null ? TIER_POINTS[rk - 1] : '—');
    const rows = [[1, 'ロゼ', 'スリーズブーケ'], [2, 'ブルー', 'DOLLCHESTRA'], [3, 'イエロー', 'みらくらぱーく！']];
    const deductNote = [1, 2, 3].map((rk) => `${rk === 1 ? 'ヒント' : ''}${circled(rk)}${tp(rk)}点`).join('→');
    const pointsNote = [1, 2, 3].map((rk) => `${levelName(rk)}${tp(rk)}点`).join('・');
    return `<div class="card legend"><span class="latin">POINT COLORS</span>
      <div class="legend-rows">${rows.map(([rk, color, unit]) => `<div class="legend-row"><span class="swatch ${tierClass(rk)}">${tp(rk)}点</span><span>${color}（${unit}）</span></div>`).join('')}</div>
      <div class="legend-note">減点方式：${deductNote}<br>点数方式：${pointsNote}</div></div>`;
  }
  const WARN_LABEL = { unassigned: '割り当てなし', empty: '空のフォルダ', 'no-answer': '解答なし', 'stage-gap': '段階の抜け', 'mixed-media': '媒体の混在', 'multi-stem-note': 'メモの付け先なし', 'unknown-suffix': '不明な接尾辞', 'duplicate-key': 'キーの重複' };
  function reportPanel(rd) {
    const info = L.baseInfo ? L.baseInfo() : { base: L.base(), tried: [] };
    const tried = (info.tried || []).map((t) => `<tr><td><code>${esc(t.base)}/</code></td><td>${t.ok ? chip('使用可', 'done') : chip('不可')}</td><td>${esc(t.reason || '')}</td></tr>`).join('');
    const warns = (rd.warnings || []).map((w) => `<tr><td>${chip(esc(WARN_LABEL[w.type] || w.type), w.type === 'empty' ? '' : 'ans')}</td><td class="path">${esc(w.path || w.genre || '')}</td><td>${esc(w.message || '')}</td></tr>`).join('');
    const nq = rd.genres.reduce((a, g) => a + g.questions.length, 0);
    return `<div class="report" data-report><div class="report-card">
      <div class="report-head"><span class="latin">LOAD REPORT</span><h2 class="report-title">読み込みレポート ─ ${esc(rd.name)}</h2><span class="spacer"></span>
        <button class="btn ghost" data-action="toggle-report">${ICON.close()}閉じる</button></div>
      <div class="report-body">
        <div class="report-meta">
          <div><span class="muted">使用中の場所</span><b>${esc(info.base || L.base())}/</b></div>
          <div><span class="muted">一覧の取り方</span><b>${esc(sourceLabel(rd.source))}</b></div>
          <div><span class="muted">ファイル数</span><b>${esc(rd.fileCount != null ? rd.fileCount : '—')}</b></div>
          <div><span class="muted">ジャンル／問題</span><b>${rd.genres.length} ／ ${nq}</b></div>
          <div><span class="muted">警告</span><b>${(rd.warnings || []).length}</b></div>
        </div>
        <h3 class="report-sub">探した場所</h3>
        <table class="report-table">${tried || '<tr><td class="muted">（情報なし）</td></tr>'}</table>
        <h3 class="report-sub">警告（空のフォルダはここにだけ出ます）</h3>
        <table class="report-table">${warns || '<tr><td class="muted">警告はありません</td></tr>'}</table>
      </div></div></div>`;
  }

  /* ================= 問題の選択画面（全ジャンル共通） ================= */
  function renderSelect(g) {
    const total = g.questions.length, started = P.countStarted(g);
    const next = nextQ(g);
    const sections = g.sections && g.sections.length ? g.sections : [{ group: null, level: null, keys: g.questions.map((q) => q.key) }];
    const labeled = sections.some((s) => s.group || s.level);
    const html = sections.map((s, i) => {
      const qs = s.keys.map((k) => findQ(g, k)).filter(Boolean);
      const prev = sections[i - 1];
      const sameGroup = prev && prev.group && prev.group === s.group;
      const label = labeled ? `<div class="sec-label">${s.group ? `<span class="sec-group ${sameGroup ? 'dim' : ''}">${esc(groupName(s.group))}</span>` : ''}
          ${s.level ? `<span class="lv-pill ${tierClass(s.level.rank)}">${esc(s.level.label)}<b>${esc(s.level.points)}</b>点</span>` : ''}</div>` : '';
      return `<section class="sec ${labeled ? 'labeled' : 'single'}">${label}<div class="sec-grid">${qs.map((q) => qCard(g, q, next)).join('')}</div></section>`;
    }).join('');
    render({
      header: hdrLeft(g.name, genreChips(g)) + pill('問題を選択', `${total}問`) + count(started, total),
      main: `<div class="sel ${labeled ? 'labeled' : ''}">${html}</div>`,
      footer: `<span class="spacer"></span>${btnTop(g.round)}`,
    });
  }
  function qCard(g, q, next) {
    const st = qst(g, q); const started = P.isStarted(st); const done = qDone(st, q);
    const isNext = next && next.key === q.key;
    const status = done ? chip(ICON.check(13) + '出題済', 'done') : started ? chip('出題中', 'playing') : isNext ? chip('次の問題', 'next') : chip('未出題');
    const inner = `<a class="card qc ${done ? 'complete' : ''}" href="${qHref(g, q.key)}" data-key="${esc(q.key)}">
      <div class="qc-top"><span class="qname">${esc(q.label)}</span>${status}</div>
      <div class="qc-chips">${q.kind ? chip(esc(q.kind), 'sm') : ''}${chip(esc(q.mode === 'clips' ? '逆転' : scoringLabel(q)), 'sm')}${chip(fmtIcon(q.format, 12) + esc(stageCountText(q)), 'sm')}</div></a>`;
    return isNext ? `<div class="next-wrap">${inner}</div>` : inner;
  }

  /* ================= 段階ヒント画面（画像・音声・歌詞画像） ================= */
  function renderStagedQuiz(g, q) {
    const st = qst(g, q);
    const shown = shownNs(q, st);
    const hi = shown.length ? shown[shown.length - 1] : null;
    const answered = !!st.answer;
    const pts = hi == null ? null : stagePoints(q, hi);
    const rank = hi == null ? null : stageRank(q, hi);
    const single = q.stages.length === 1;
    const stateLabel = answered ? '解答 表示中' : hi != null ? (single ? `${stageName(q, hi)} 表示中` : `${stageName(q, hi)} まで表示中`) : single ? '問題 未表示' : 'ヒント未表示';
    const header = quizHead(g, q, (q.kind ? chip(esc(q.kind)) : '') + chip(esc(scoringLabel(q))) + levelChip(q))
      + pill('状態', esc(stateLabel), answered ? 'check' : 'eye', 'p2')
      + `<div class="hdr-right">${badge('現在の', '点数', pts == null ? '—' : pts, pts == null ? null : rank)}</div>`;

    if (subView === 'video' && q.answer.video) {
      render({
        header,
        main: playerView({ src: q.answer.video, label: '解答動画', points: pts, rank, note: answerTextHtml(q) }),
        footer: `${btnBack(genreHref(g))}
          <div class="controls">
            <button class="btn grad lg" data-action="answer-back">${ICON.back(18)}問題に戻る</button>
            <button class="btn" data-action="video-restart">${ICON.refresh(16)}解答動画を最初から</button>
          </div>
          <button class="btn ghost" data-action="reset-q" data-key="${esc(q.key)}">${ICON.refresh()}問題をリセット</button>
          ${btnTop(g.round)}`,
      });
      wirePlayer(null, '解答動画');
      return;
    }

    let body;
    if ((answered && q.answer.image) || q.format !== 'audio') body = imageView(g, q, hi, answered);
    else body = audioTiles(g, q, st);
    render({
      header,
      cls: 'staged',
      main: body + (answered ? answerBar(g, q) : ''),
      footCls: 'quiz',
      footer: `${btnBack(genreHref(g))}
        <div class="stage-btns">${stageButtons(q, st)}</div>
        <div class="stage-item">${answered
          ? `<button class="btn shown" disabled>${ICON.check()}解答 表示中</button><button class="undo-btn" data-action="undo-answer">${ICON.undo(12)}取り消し</button>`
          : `<button class="btn red" data-action="show-answer" ${hi != null ? '' : 'disabled'}>${ICON.eye()}解答を表示</button>`}</div>
        <span class="spacer"></span>
        <button class="btn ghost" data-action="reset-q" data-key="${esc(q.key)}">${ICON.refresh()}問題をリセット</button>
        ${btnTop(g.round)}`,
    });
    stage.querySelectorAll('img[data-stage-img]').forEach((img) => img.addEventListener('error', () => {
      toast(fileErr(img.getAttribute('src'), img.dataset.what));
      const ph = document.createElement('div'); ph.className = 'placeholder';
      ph.innerHTML = `${ICON.alert(56)}<span class="ph-title">画像を読み込めません</span><span class="ph-sub">Drive からダウンロードされていない可能性があります</span>`;
      img.replaceWith(ph);
    }));
  }
  function imageView(g, q, hi, answered) {
    const first = q.stages[0];
    let src = null, tag = q.stages.length === 1 ? '問題 未表示' : 'ヒント未表示', textStage = null;
    if (answered && q.answer.image) { src = q.answer.image; tag = '解答'; }
    else if (hi != null) {
      const s = q.stages.find((x) => x.n === hi);
      tag = stageName(q, hi);
      if (s && s.format === 'text') textStage = s; else if (s) src = s.src;
    }
    const inner = textStage ? `<div class="stage-text">${textSpan(textStage.src, 'all')}</div>`
      : src ? `<img class="stage-img" data-stage-img data-what="${esc(tag)}" src="${esc(src)}" alt="">`
      : `<div class="placeholder">${ICON.image(72)}<span class="ph-title">${esc(first ? stageName(q, first.n) : 'ヒント')}を出してください</span><span class="ph-sub">${q.stages.length > 1 ? `下のボタンで ${esc(stageSeq(q))} の順に出します` : '下のボタンで出します'}</span></div>`;
    return `<div class="imgbox"><div class="imgbox-top"><span class="pill-solid ${answered && q.answer.image ? 'ans' : ''}">${ICON.eye(14)}${esc(tag)}</span></div>${inner}</div>`;
  }
  function audioTiles(g, q, st) {
    const np = npIs(g, q.key) ? nowPlaying : null;
    const tiles = q.stages.map((s, i) => {
      const on = !!st.stages[s.n];
      const prevOk = i === 0 || !!st.stages[q.stages[i - 1].n];
      const playing = np && np.n === s.n;
      const p = q.scoring === 'points' ? null : stagePoints(q, s.n);
      const cls = `stage-tile ${tierClass(stageRank(q, s.n))} ${on ? 'revealed' : ''} ${playing ? 'playing' : ''} ${!on && prevOk ? 'next' : ''}`;
      const state = playing ? (audio.paused ? '一時停止中' : '再生中') : on ? '済 ・ もう一度流す' : prevOk ? '押すと再生' : 'ロック中';
      const ic = playing ? (audio.paused ? ICON.pause(22) : ICON.wave(24)) : on ? ICON.check(22) : prevOk ? ICON.play(20) : ICON.lock(20);
      return `<button class="${cls}" data-action="stage" data-n="${s.n}" ${!on && !prevOk ? 'disabled' : ''}>
        <span class="tile-num">${circled(s.n)}</span><span class="tile-lbl">${stageName(q, s.n)}${p != null ? ` <b>${p}点</b>` : ''}</span>
        <span class="tile-state">${ic}${state}</span></button>`;
    }).join('');
    const cols = q.stages.length <= 3 ? q.stages.length : Math.min(5, Math.max(4, Math.ceil(q.stages.length / 2)));
    return `<div class="stage-audio"><div class="stage-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${tiles}</div>
      <div class="np-card">${npBlock(np)}</div></div>`;
  }
  function stageButtons(q, st) {
    let list = q.stages.map((s, i) => ({ s, i }));
    let counter = '';
    if (q.stages.length > 4) {   // 段階が多いときは「最後に出した段階」と「次の段階」だけ
      const lastOn = [...list].reverse().find(({ s }) => st.stages[s.n]);
      const nextOff = list.find(({ s }) => !st.stages[s.n]);
      list = [lastOn, nextOff].filter(Boolean);
      counter = `<span class="footer-note">${shownNs(q, st).length} / ${q.stages.length}</span>`;
    }
    return list.map(({ s, i }) => {
      const on = !!st.stages[s.n];
      const prevOk = i === 0 || !!st.stages[q.stages[i - 1].n];
      const p = q.scoring === 'points' ? null : stagePoints(q, s.n);
      const text = `${stageName(q, s.n)}${p != null ? `（${p}点）` : ''}`;
      const cls = `btn stage-btn ${tierClass(stageRank(q, s.n))} ${on ? 'revealed' : !on && prevOk ? 'next' : ''}`;
      return `<div class="stage-item"><button class="${cls}" data-action="stage" data-n="${s.n}" ${!on && !prevOk ? 'disabled' : ''}>${on ? ICON.check() : prevOk ? ICON.eye() : ICON.lock()}${text}</button>
        ${on ? `<button class="undo-btn" data-action="undo-stage" data-n="${s.n}" title="${stageName(q, s.n)}${q.stages.length > 1 ? '以降' : ''}を取り消す">${ICON.undo(12)}取り消し</button>` : ''}</div>`;
    }).join('') + counter;
  }
  function answerBar(g, q) {
    const a = q.answer;
    const text = answerTextHtml(q);
    if (!text && !a.audio && !a.video) return '';
    const playingAns = npIs(g, q.key, 'ans');
    return `<section class="answer">
      <span class="ans-lbl"><span class="latin red">ANSWER</span><span>解答</span></span>
      <div class="ans-text on" data-answer-text>${text || `<span class="muted">${a.image ? '解答の画像を表示中' : ''}</span>`}</div>
      ${a.audio ? `<button class="btn red lg" data-action="answer-audio">${playingAns ? (audio.paused ? ICON.play(18) + '再開' : ICON.stop(18) + '停止') : ICON.play(18) + '解答を再生'}</button>` : ''}
      ${a.video ? `<button class="btn red lg" data-action="answer-video">${ICON.video(18)}解答動画を再生</button>` : ''}
    </section>`;
  }

  /* ================= 音声の一覧型（仕様書タブ2） ================= */
  function renderAudioList(g, focusKey) {
    const total = g.questions.length, started = P.countStarted(g);
    const np = nowPlaying && nowPlaying.gid === g.id && nowPlaying.round === g.round ? nowPlaying : null;
    const last = np || lastPlayed[g.round + '/' + g.id];
    const curPts = last && last.points != null ? last.points : null;
    const rows = g.questions.map((q) => {
      const st = qst(g, q); const isStarted = P.isStarted(st), done = P.isDone(st, q);
      const status = done ? chip('出題済', 'done')
        : isStarted ? `<button class="chip playing" data-action="mark-done" data-key="${esc(q.key)}" title="出題済にする">出題中</button>` : chip('未出題');
      const resetBtn = `<button class="icon-btn" data-action="reset-q" data-key="${esc(q.key)}" title="${esc(q.label)}の記録をリセット" aria-label="${esc(q.label)}の記録をリセット" ${isStarted ? '' : 'disabled'}>${ICON.refresh(14)}</button>`;
      const clips = q.stages.map((s) => {
        const on = !!st.stages[s.n]; const playing = np && np.key === q.key && np.n === s.n;
        const p = stagePoints(q, s.n); const tc = tierClass(stageRank(q, s.n));
        const cls = playing ? `clip playing ${tc}` : on ? 'clip played' : `clip ${tc}`;
        const ic = playing ? (audio.paused ? ICON.pause(16) : ICON.wave(17)) : on ? ICON.check(17) : ICON.play(15);
        const tag = playing ? `<span class="tag">${audio.paused ? '一時停止' : '再生中'}</span>` : on ? '<span class="tag">済</span>' : '';
        return `<div class="clip-cell"><button class="${cls}" data-action="list-play" data-key="${esc(q.key)}" data-n="${s.n}">${ic}${stageName(q, s.n)}${p != null ? `<small>${p}点</small>` : ''}${tag}</button>
          ${on ? `<button class="undo-btn" data-action="list-undo" data-key="${esc(q.key)}" data-n="${s.n}">${ICON.undo(12)}取り消し</button>` : ''}</div>`;
      }).join('');
      const pad = Array.from({ length: Math.max(0, 3 - q.stages.length) }, () => '<div class="clip-cell"></div>').join('');
      const playingAns = np && np.key === q.key && np.n === 'ans';
      const ansText = st.answer ? (answerTextHtml(q, 'ans-inline') || '<span class="ans-inline muted">（答えのメモがありません）</span>') : '';
      const ansBtn = !st.answer
        ? `<button class="btn red sm" data-action="list-answer" data-key="${esc(q.key)}">${ICON.eye()}答え</button>`
        : q.answer.audio ? `<button class="btn red sm" data-action="list-answer" data-key="${esc(q.key)}">${playingAns ? (audio.paused ? ICON.play() + '再開' : ICON.stop() + '停止') : ICON.play() + '解答'}</button>` : '';
      const ansUndo = st.answer ? `<button class="undo-btn" data-action="list-answer-undo" data-key="${esc(q.key)}">${ICON.undo(12)}隠す</button>` : '';
      return `<div class="qrow ${done ? 'is-done' : ''} ${focusKey === q.key ? 'focus' : ''}" data-row="${esc(q.key)}">
        <div class="qlabel-col"><span class="qlabel">${esc(q.label)}</span>${q.kind ? chip(esc(q.kind), 'sm') : ''}</div>
        ${clips}${pad}
        <div class="ans-cell">${ansText}<div class="ans-btns">${ansBtn}${ansUndo}</div></div>
        <div class="qstatus">${status}${resetBtn}</div></div>`;
    }).join('');
    render({
      cls: `audio n${Math.min(total, 10)}`,
      header: hdrLeft(g.name, genreChips(g))
        + (np ? pill(np.qlabel || '', `${esc(np.what || '')} ${audio.paused ? '一時停止' : '再生中'}`, audio.paused ? 'pause' : 'wave', 'p2') : pill('待機中', 'クリップを選択'))
        + `<div class="hdr-right">${count(started, total)}${badge('現在の', '点数', curPts == null ? '—' : curPts, curPts == null ? null : last.rank)}</div>`,
      main: `<section class="card list">${rows}</section>`,
      footer: `${npBlock(np)}${btnTop(g.round)}`,
    });
    if (scrollFocus && focusKey) { const row = stage.querySelector('.qrow.focus'); if (row) row.scrollIntoView({ block: 'nearest' }); }
  }

  /* ================= 逆転（clips） ================= */
  function renderClipsQuiz(g, q) {
    const st = qst(g, q);
    const np = npIs(g, q.key) ? nowPlaying : null;
    const opened = shownNs(q, st).length;
    const tiles = q.stages.map((s) => {
      const open = !!st.stages[s.n]; const playing = np && np.n === s.n;
      const played = clipPlayed.has(`${g.round}|${g.id}|${q.key}|${s.n}`);
      const ic = playing ? (audio.paused ? ICON.pause(18) : ICON.wave(20)) : played ? ICON.check(18) : ICON.play(16);
      return `<div class="clip-tile ${playing ? 'playing' : ''} ${played ? 'played' : ''} ${open ? 'open' : ''}">
        <button class="clip-play" data-action="clip-play" data-n="${s.n}" aria-label="${circled(s.n)}を再生"><span class="clip-num">${circled(s.n)}</span><span class="clip-ic">${ic}</span></button>
        <div class="clip-ans">${open
          ? `${q.answer.textSrc ? textSpan(q.answer.textSrc, `clip:${s.n}`, 'clip-ans-text') : '<span class="clip-ans-text muted">（メモがありません）</span>'}<button class="undo-btn" data-action="clip-answer" data-n="${s.n}">${ICON.eyeOff(12)}隠す</button>`
          : `<button class="chip ans" data-action="clip-answer" data-n="${s.n}">${ICON.eye(12)}答え</button>`}</div></div>`;
    }).join('');
    const sub = q.answer.textSrc ? textSpan(q.answer.textSrc, 'first', 'sub-text') : '';
    const rows = Math.ceil(q.stages.length / 5);
    render({
      header: quizHead(g, q, chip('逆転') + levelChip(q))
        + `<div class="pill clip-sub"><span>お題</span><span class="pill-val">${sub || '—'}</span></div>`
        + `<div class="hdr-right">${count(opened, q.stages.length, '答え')}</div>`,
      cls: 'clips',
      main: `<div class="clip-grid" style="grid-template-rows:repeat(${rows},minmax(0,1fr))">${tiles}</div>`,
      footer: `${btnBack(genreHref(g))}
        <button class="btn" data-action="clips-hide-all" ${opened ? '' : 'disabled'}>${ICON.eyeOff()}すべての答えを隠す</button>
        <button class="btn ghost" data-action="reset-q" data-key="${esc(q.key)}">${ICON.refresh()}問題をリセット</button>
        ${npBlock(np, { noToggle: true })}${btnTop(g.round)}`,
    });
  }

  /* ================= 対動画（問題動画／回答動画） ================= */
  const videoWord = () => (videoMode === 'a' ? '回答動画' : '問題動画');
  function renderVideoQuiz(g, q) {
    const pair = q.pair || {};
    const src = videoMode === 'a' ? pair.answer : pair.question;
    render({
      header: quizHead(g, q, levelChip(q) + chip(esc(scoringLabel(q))))
        + pill('状態', `${ICON.pause(14)}${videoWord()} 停止中`, null, 'p2', 'data-video-pill')
        + badge('この問題', 'の点数', q.pointsValue != null ? q.pointsValue : '—', q.tierRank),
      main: playerView({ src, label: videoWord() }),
      footer: `${btnBack(genreHref(g))}
        <div class="controls">
          <div class="controls-group"><span class="seg-label">いま流している動画</span>
            <div class="segment"><button class="${videoMode === 'q' ? 'on' : ''}" data-action="video-mode" data-mode="q">問題動画</button><button class="${videoMode === 'a' ? 'on' : ''}" data-action="video-mode" data-mode="a">回答動画</button></div></div>
          <button class="btn red lg" data-action="video-answer" ${pair.answer ? '' : 'disabled'}>${ICON.eye(19)}回答動画を再生</button>
          <button class="btn" data-action="video-restart" ${pair.question ? '' : 'disabled'}>${ICON.refresh(16)}問題動画を最初から</button>
        </div>
        <button class="btn ghost" data-action="reset-q" data-key="${esc(q.key)}">${ICON.refresh()}問題をリセット</button>
        ${btnTop(g.round)}`,
    });
    wirePlayer(() => {
      if (videoMode === 'q') P.patch(g.round, g.id, q.key, { played: true }); else P.setAnswer(g.round, g.id, q.key, true);
    }, videoWord);
  }
  // 問題動画⇄回答動画を <video> を作り直さずに切り替える
  function setVideoMode(q, mode) {
    videoMode = mode;
    const v = videoOnStage(); if (!v) return;
    const pair = q.pair || {};
    const src = mode === 'a' ? pair.answer : pair.question;
    v.pause();
    if (src) v.setAttribute('src', src); else v.removeAttribute('src');
    v.load();
    stage.querySelectorAll('[data-action="video-mode"]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    const lbl = stage.querySelector('[data-player-label]'); if (lbl) lbl.innerHTML = ICON.video(14) + esc(videoWord());
    const pl = stage.querySelector('[data-player]'); if (pl) pl.dataset.what = videoWord();
    const big = stage.querySelector('[data-bigplay-lbl]'); if (big) big.textContent = `${videoWord()}を再生`;
    const note = stage.querySelector('[data-note]'); if (note) note.textContent = src ? '' : 'ファイルがありません';
    syncVideoUI(videoWord);
  }

  /* ---------------- ルーティング ---------------- */
  function parseHash() { return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch (e) { return s; } }); }
  function draw() {
    if (loading) return;
    const [rname, gid, key] = parseHash();
    const rd = rname ? roundByName(rname.normalize('NFC')) : null;
    cur = { round: rd ? rd.name : null, genre: null, q: null };
    if (!rd) { if (rname && rounds.length) toast(`「${rname}」のフォルダが見つかりません`); return renderRounds(); }
    const genre = gid ? rd.genres.find((g) => g.id === gid.normalize('NFC')) : null;
    if (!genre) return renderTop(rd);
    cur.genre = genre;
    const q = key ? findQ(genre, key.normalize('NFC')) : null;
    cur.q = q;
    if (isAudioList(genre)) return renderAudioList(genre, q ? q.key : null);
    if (key && !q) toast(`「${key}」の問題が見つかりません`);
    if (!q) return renderSelect(genre);
    if (q.mode === 'pair') return renderVideoQuiz(genre, q);
    if (q.mode === 'clips') return renderClipsQuiz(genre, q);
    return renderStagedQuiz(genre, q);
  }
  function route() { stopMedia(); videoMode = 'q'; subView = 'stages'; showReport = false; scrollFocus = true; draw(); scrollFocus = false; window.scrollTo(0, 0); }
  function rerender() { draw(); }

  /* ---------------- 操作 ---------------- */
  function listQ(g, el) { return findQ(g, el.dataset.key); }
  function playStage(g, q, n, label) {
    const s = q.stages.find((x) => x.n === n); if (!s) return;
    if (npIs(g, q.key, n)) { toggleAudio(); return; }
    const what = label || stageName(q, n);
    const meta = { round: g.round, gid: g.id, key: q.key, n, what, qlabel: q.label, label: `${q.label} ・ ${what}`, points: stagePoints(q, n), rank: stageRank(q, n) };
    lastPlayed[g.round + '/' + g.id] = meta;
    playAudio(s.src, meta);
  }
  function playAnswerAudio(g, q) {
    if (npIs(g, q.key, 'ans')) { if (audio.paused) audio.play().catch(() => {}); else stopAudio(); return; }
    playAudio(q.answer.audio, { round: g.round, gid: g.id, key: q.key, n: 'ans', what: '解答', qlabel: q.label, label: `${q.label} ・ 解答`, points: null, rank: null });
  }

  stage.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const r = cur.round, g = cur.genre, q = cur.q;
    const action = el.dataset.action;
    const n = el.dataset.n != null ? Number(el.dataset.n) : null;
    switch (action) {
      case 'reload-all': loadAll(); break;
      case 'reset-round':
        if (confirm(`${r} のすべての進捗（出題済の記録）をリセットしますか？`)) { stopAudio(); P.resetRound(r); toast(`${r} の進捗をリセットしました`); rerender(); }
        break;
      case 'toggle-report': showReport = !showReport; rerender(); break;
      case 'fullscreen':
        if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => toast('全画面にできません'));
        break;
      case 'stop': stopAudio(); refresh(); break;
      case 'audio-toggle': toggleAudio(); refresh(); break;
      case 'mark-done': P.patch(r, g.id, el.dataset.key, { done: true }); rerender(); break;
      case 'reset-q': {
        const tq = findQ(g, el.dataset.key); if (!tq) break;
        if (confirm(`${tq.label} の記録（済・出題中）をリセットしますか？`)) {
          if (npIs(g, tq.key)) stopAudio();
          { const v = videoOnStage(); if (v) v.pause(); }
          P.resetQ(r, g.id, tq.key);
          [...clipPlayed].forEach((k) => { if (k.startsWith(`${r}|${g.id}|${tq.key}|`)) clipPlayed.delete(k); });
          subView = 'stages';
          toast(`${tq.label} をリセットしました`); rerender();
        }
        break;
      }

      /* 段階ヒント画面 */
      case 'stage': {
        if (!q) break;
        const i = q.stages.findIndex((x) => x.n === n); if (i < 0) break;
        const st = qst(g, q);
        const prevOk = i === 0 || !!st.stages[q.stages[i - 1].n];
        if (!st.stages[n] && !prevOk) break;
        if (!st.stages[n]) P.revealStage(r, g.id, q.key, n);
        if (q.stages[i].format === 'audio') playStage(g, q, n);
        rerender();
        break;
      }
      case 'undo-stage':
        if (!q) break;
        if (npIs(g, q.key) && typeof nowPlaying.n === 'number' && nowPlaying.n >= n) stopAudio();
        P.undoStage(r, g.id, q.key, n); rerender();
        break;
      case 'show-answer': {
        if (!q || !shownNs(q, qst(g, q)).length) break;
        P.setAnswer(r, g.id, q.key, true);
        if (q.answer.video) { stopAudio(); subView = 'video'; rerender(); startVideo(true); } else rerender();
        break;
      }
      case 'undo-answer':
        if (!q) break;
        if (npIs(g, q.key, 'ans')) stopAudio();
        P.setAnswer(r, g.id, q.key, false); subView = 'stages'; rerender();
        break;
      case 'answer-audio': if (q) { playAnswerAudio(g, q); rerender(); } break;
      case 'answer-video': if (q && q.answer.video) { stopAudio(); subView = 'video'; rerender(); startVideo(true); } break;
      case 'answer-back': { const v = videoOnStage(); if (v) v.pause(); subView = 'stages'; rerender(); break; }

      /* 音声の一覧型 */
      case 'list-play': {
        const tq = listQ(g, el); if (!tq) break;
        if (!qst(g, tq).stages[n]) P.revealStage(r, g.id, tq.key, n);
        playStage(g, tq, n); rerender();
        break;
      }
      case 'list-undo': {
        const tq = listQ(g, el); if (!tq) break;
        if (npIs(g, tq.key, n)) stopAudio();
        P.clearStage(r, g.id, tq.key, n); rerender();
        break;
      }
      case 'list-answer': {
        const tq = listQ(g, el); if (!tq) break;
        if (!qst(g, tq).answer) { P.setAnswer(r, g.id, tq.key, true); if (tq.answer.audio) playAnswerAudio(g, tq); }
        else if (tq.answer.audio) playAnswerAudio(g, tq);
        rerender();
        break;
      }
      case 'list-answer-undo': {
        const tq = listQ(g, el); if (!tq) break;
        if (npIs(g, tq.key, 'ans')) stopAudio();
        P.setAnswer(r, g.id, tq.key, false); rerender();
        break;
      }

      /* 逆転 */
      case 'clip-play': {
        if (!q) break;
        clipPlayed.add(`${r}|${g.id}|${q.key}|${n}`);
        P.patch(r, g.id, q.key, { played: true });
        playStage(g, q, n, circled(n)); rerender();
        break;
      }
      case 'clip-answer': {
        if (!q) break;
        if (qst(g, q).stages[n]) P.clearStage(r, g.id, q.key, n); else P.revealStage(r, g.id, q.key, n);
        rerender();
        break;
      }
      case 'clips-hide-all': if (q) { P.patch(r, g.id, q.key, { stages: {} }); rerender(); } break;

      /* 動画（<video> が出ている間は描き直さない） */
      case 'video-toggle': toggleVideo(); break;
      case 'video-mode': if (q && el.dataset.mode !== videoMode) setVideoMode(q, el.dataset.mode); break;
      case 'video-answer': if (q) { if (videoMode !== 'a') setVideoMode(q, 'a'); startVideo(true); } break;
      case 'video-restart':
        if (q && q.mode === 'pair' && videoMode !== 'q') setVideoMode(q, 'q');
        startVideo(true);
        break;
    }
    if (el.blur) el.blur();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches && e.target.matches('input, textarea')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (videoOnStage()) { toggleVideo(); return; }
      if (nowPlaying) { toggleAudio(); rerender(); }
    } else if (e.key === 'Escape') {
      if (showReport) { showReport = false; rerender(); return; }
      // 画面の「戻る」と同じく 1 階層上へ：問題 → ジャンル画面 → TOP → 回の選択
      // （音源一覧はジャンル画面そのもので、キーは選択位置だけなので TOP へ）
      if (cur.q && cur.genre && !isAudioList(cur.genre)) location.hash = genreHref(cur.genre);
      else if (cur.round) location.hash = cur.genre ? roundHref(cur.round) : '#/';
    }
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
