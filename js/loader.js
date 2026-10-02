/* フォルダ構成の読み込み ─ 回 → ジャンル → 問題 をフォルダ名・ファイル名から組み立てる */
(function () {
  'use strict';
  const CFG = window.QUIZ_CONFIG || {};
  const BASE = String(CFG.mediaBase || 'media').replace(/\/+$/, '');
  const LIST = CFG.listFileName || '読み込み用ファイル.txt';

  const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg|flac)$/i;
  const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;
  const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;
  const TEXT_EXT = /\.txt$/i;
  const LEVELS = { '初級': 1, '中級': 2, '上級': 3, '1点': 1, '2点': 2, '3点': 3 };
  const CATEGORY_TYPES = [[/音声|イントロ|アウトロ/, 'audio'], [/歌詞/, 'lyrics'], [/動画|映像/, 'video'], [/文章|画像|1枚絵/, 'image']];
  const DEFAULT_CATEGORY = { audio: '楽曲・音声', lyrics: '楽曲・歌詞', video: '動画', image: '文章' };
  const CATEGORY_ORDER = ['楽曲・音声', '楽曲・歌詞', '動画', '文章'];

  const u = (path) => BASE + (path ? '/' + path.split('/').map(encodeURIComponent).join('/') : '');
  const hidden = (name) => !name || name.startsWith('_') || name.startsWith('.') || name === LIST;
  const numberOf = (s) => { const m = String(s).match(/(\d+)/); return m ? parseInt(m[1], 10) : null; };

  async function fetchText(path) {
    try { const r = await fetch(u(path), { cache: 'no-store' }); if (!r.ok) return null; return await r.text(); } catch (e) { return null; }
  }
  // サーバー（python3 -m http.server など）が返すフォルダ一覧の HTML を読む
  async function fetchListing(dirPath) {
    try {
      const r = await fetch(u(dirPath) + '/', { cache: 'no-store' });
      if (!r.ok) return null;
      if (!/html/i.test(r.headers.get('content-type') || '')) return null;
      const html = await r.text();
      if (!/Directory listing|Index of|<title>[^<]*\/[^<]*<\/title>/i.test(html) && !/<ul>/i.test(html)) return null;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const entries = [];
      doc.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href') || '';
        if (!href || /^(\?|#|\/|\.\.|[a-z]+:)/i.test(href)) return;
        let name; try { name = decodeURIComponent(href); } catch (e) { name = href; }
        const isDir = name.endsWith('/');
        name = name.replace(/\/+$/, '');
        if (!name || name.includes('/')) return;
        entries.push({ name, isDir });
      });
      return entries;
    } catch (e) { return null; }
  }
  async function walk(dir, depth) {
    const entries = await fetchListing(dir);
    if (!entries) return null;
    const files = [], dirs = [];
    entries.forEach((e) => { if (hidden(e.name) && !e.isDir) return; const p = dir ? dir + '/' + e.name : e.name; (e.isDir ? dirs : files).push(p); });
    if (depth > 0) {
      const subs = await Promise.all(dirs.map((d) => walk(d, depth - 1)));
      subs.forEach((s) => { if (s) files.push(...s); });
    }
    return files;
  }

  /* ---------- 回の一覧 ---------- */
  function sortNatural(names) {
    return names.slice().sort((a, b) => { const na = numberOf(a), nb = numberOf(b); if (na != null && nb != null && na !== nb) return na - nb; return a.localeCompare(b, 'ja'); });
  }
  async function discoverRounds() {
    const txt = await fetchText(LIST);
    if (txt != null) {
      const names = new Set();
      txt.split(/\r?\n/).forEach((l) => { l = l.trim().replace(/\\/g, '/').replace(/^\.?\//, ''); if (!l || l.startsWith('#')) return; const first = l.split('/')[0]; if (!hidden(first)) names.add(first); });
      if (names.size) return { rounds: sortNatural([...names]), source: 'list' };
    }
    const entries = await fetchListing('');
    if (entries) {
      const dirs = entries.filter((e) => e.isDir && !hidden(e.name)).map((e) => e.name);
      if (dirs.length) return { rounds: sortNatural(dirs), source: 'listing' };
    }
    const found = []; let misses = 0;
    for (let i = 1; i <= (CFG.maxRounds || 30) && misses < 3; i++) {
      const name = `第${i}回`;
      const ok = (await fetchText(name + '/' + LIST)) != null || (await fetchListing(name)) != null;
      if (ok) { found.push(name); misses = 0; } else misses++;
    }
    return { rounds: found, source: 'probe' };
  }

  /* ---------- 回のファイル一覧 ---------- */
  async function roundFiles(round) {
    const txt = await fetchText(round + '/' + LIST);
    if (txt != null) {
      const files = [];
      txt.split(/\r?\n/).forEach((l) => {
        l = l.trim().replace(/\\/g, '/').replace(/^\.?\//, '');
        if (!l || l.startsWith('#')) return;
        if (l.startsWith(round + '/')) l = l.slice(round.length + 1);
        if (l.startsWith(BASE + '/' + round + '/')) l = l.slice(BASE.length + round.length + 2);
        files.push(l);
      });
      return { files, source: 'list' };
    }
    const walked = await walk(round, 4);
    if (walked) return { files: walked.map((f) => f.slice(round.length + 1)), source: 'listing' };
    return null;
  }

  /* ---------- 名前の解釈 ---------- */
  function parseGenreName(folder) {
    let parts = folder.split('_');
    let order = null;
    if (parts.length >= 2 && /^\d+$/.test(parts[0])) { order = parseInt(parts[0], 10); parts = parts.slice(1); }
    if (parts.length >= 3) return { order, category: parts[0], name: parts.slice(1, -1).join('_'), modeLabel: parts[parts.length - 1] };
    if (parts.length === 2) return { order, category: parts[0], name: parts[1], modeLabel: '' };
    return { order, category: '', name: parts[0], modeLabel: '' };
  }
  // 段階（ステップ）の読み取り：_ver1/_ver2/_ver3 → 3点/2点/1点、_ver4 → 回答
  // 代わりに ①②③④ や、名前の末尾の 1〜4 でもよい（例：画像①.png、画像2.png）
  const CIRCLED = { '①': 1, '②': 2, '③': 3, '④': 4, '１': 1, '２': 2, '３': 3, '４': 4 };
  function stepOf(file) {
    const stem = file.replace(/\.[^.]+$/, '');
    const m = stem.match(/_ver(\d)/i);
    if (m) return parseInt(m[1], 10);
    const c = stem.match(/[①②③④１２３４]/);
    if (c) return CIRCLED[c[0]];
    const t = stem.match(/(?:^|[^\d])([1-4])$/);
    return t ? parseInt(t[1], 10) : null;
  }
  const STEP_TIER = { 1: 3, 2: 2, 3: 1 };
  const tierOf = (file) => { const st = stepOf(file); return st && STEP_TIER[st] ? STEP_TIER[st] : null; };
  const isAnswer = (file) => /回答|正解|答え|answer/i.test(file) || stepOf(file) === 4;

  function buildRound(roundName, files) {
    const byGenre = new Map();
    files.forEach((f) => {
      const segs = f.split('/').filter(Boolean);
      if (segs.length < 2) return;
      if (hidden(segs[0]) || hidden(segs[segs.length - 1])) return;
      if (!byGenre.has(segs[0])) byGenre.set(segs[0], []);
      byGenre.get(segs[0]).push(segs.slice(1));
    });
    const genres = [];
    for (const [folder, rels] of byGenre) {
      const meta = parseGenreName(folder);
      const ext = { audio: 0, video: 0, image: 0, text: 0 };
      rels.forEach((r) => { const b = r[r.length - 1]; if (AUDIO_EXT.test(b)) ext.audio++; else if (VIDEO_EXT.test(b)) ext.video++; else if (IMAGE_EXT.test(b)) ext.image++; else if (TEXT_EXT.test(b)) ext.text++; });
      let type = null;
      for (const [re, t] of CATEGORY_TYPES) if (re.test(meta.category)) { type = t; break; }
      if (!type) type = ext.video ? 'video' : ext.image ? 'image' : (ext.text && ext.audio) ? 'lyrics' : ext.audio ? 'audio' : 'image';
      // カテゴリ名とファイルの中身が食い違うときは拡張子を優先
      if (type === 'audio' && !ext.audio && ext.image) type = 'image';
      if (type === 'image' && !ext.image && ext.audio) type = ext.text ? 'lyrics' : 'audio';
      if (type === 'video' && !ext.video) type = ext.image ? 'image' : ext.audio ? 'audio' : type;
      const hasLevels = rels.some((r) => r.length >= 2 && LEVELS[r[0]] != null);
      const scoring = /点数/.test(meta.modeLabel) ? 'points' : /減点/.test(meta.modeLabel) ? 'deduct' : (hasLevels ? 'points' : 'deduct');
      const genre = {
        id: folder, folder, order: meta.order, name: meta.name,
        category: meta.category || DEFAULT_CATEGORY[type], scoring, scoringLabel: meta.modeLabel || undefined,
        type, round: roundName, base: `${BASE}/${roundName}/${folder}`,
      };
      if (hasLevels || (type === 'video' && scoring === 'points')) buildLevels(genre, rels); else buildQuestions(genre, rels);
      genres.push(genre);
    }
    genres.sort((a, b) => {
      if (a.order != null || b.order != null) { if (a.order == null) return 1; if (b.order == null) return -1; if (a.order !== b.order) return a.order - b.order; }
      const ca = CATEGORY_ORDER.findIndex((c) => a.category.startsWith(c)), cb = CATEGORY_ORDER.findIndex((c) => b.category.startsWith(c));
      if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
      return a.folder.localeCompare(b.folder, 'ja');
    });
    return genres;
  }
  const filePath = (genre, segs) => `${genre.base}/${segs.join('/')}`;

  function buildQuestions(genre, rels) {
    const qmap = new Map();
    rels.forEach((r) => {
      let id, fileSegs;
      const m = r[0].match(/^第(\d+)問/);
      if (r.length >= 2 && m) { id = parseInt(m[1], 10); fileSegs = r; }
      else if (r.length === 1) { id = numberOf(r[0]) || 0; fileSegs = r; }
      else { id = numberOf(r[0]) || 0; fileSegs = r; }
      if (!qmap.has(id)) qmap.set(id, { id, files: [] });
      qmap.get(id).files.push(fileSegs);
    });
    genre.questions = [...qmap.values()].sort((a, b) => a.id - b.id).map((q) => {
      const out = { id: q.id, key: 'q' + q.id };
      if (genre.type === 'audio') {
        out.clips = {};
        q.files.forEach((segs) => { const f = segs[segs.length - 1]; const t = tierOf(f); if (t && AUDIO_EXT.test(f)) out.clips[t] = filePath(genre, segs); });
      } else if (genre.type === 'lyrics') {
        out.lyricsFiles = {};
        q.files.forEach((segs) => { const f = segs[segs.length - 1]; const t = tierOf(f); if (t && TEXT_EXT.test(f)) out.lyricsFiles[t] = filePath(genre, segs); else if (isAnswer(f) && TEXT_EXT.test(f)) out.answerFile = filePath(genre, segs); else if (AUDIO_EXT.test(f) && !t) out.audio = filePath(genre, segs); });
      } else {
        out.images = {};
        const imgs = q.files.filter((segs) => IMAGE_EXT.test(segs[segs.length - 1])).sort((a, b) => a[a.length - 1].localeCompare(b[b.length - 1], 'ja', { numeric: true }));
        imgs.forEach((segs) => { const f = segs[segs.length - 1]; const p = filePath(genre, segs); const t = tierOf(f); if (isAnswer(f)) out.images.answer = p; else if (t === 3) out.images.question = p; else if (t === 2) out.images.hint1 = p; else if (t === 1) out.images.hint2 = p; });
        // 段階が読み取れない画像は名前順に 問題 → ヒント1 → ヒント2 → 回答 と割り当てる
        const rest = imgs.filter((segs) => { const f = segs[segs.length - 1]; return !isAnswer(f) && !tierOf(f); });
        ['question', 'hint1', 'hint2', 'answer'].forEach((slot) => { if (!out.images[slot] && rest.length) out.images[slot] = filePath(genre, rest.shift()); });
      }
      return out;
    });
  }

  function buildLevels(genre, rels) {
    const levels = new Map();
    rels.forEach((r) => {
      let points, label, rest;
      if (r.length >= 2 && LEVELS[r[0]] != null) { points = LEVELS[r[0]]; label = r[0]; rest = r.slice(1); }
      else { points = 1; label = '問題'; rest = r; }
      const file = rest[rest.length - 1];
      if (!VIDEO_EXT.test(file) && !AUDIO_EXT.test(file) && !IMAGE_EXT.test(file)) return;
      // 問題と回答の対：同じ「幹」（_問題／_正解 などを除いた名前）で組にする
      const stem = file.replace(/\.[^.]+$/, '').replace(/[_ 　-]*(問題|回答|正解|答え|question|answer)\s*$/i, '');
      let id = null;
      if (rest.length >= 2) { const m = rest[0].match(/^第(\d+)問/); if (m) id = parseInt(m[1], 10); }
      if (id == null) { const n = stem.match(/(\d+)\s*$/); if (n) id = parseInt(n[1], 10); }
      if (!levels.has(points)) levels.set(points, { points, label, questions: new Map(), stems: new Map() });
      const lv = levels.get(points), qs = lv.questions;
      const stemKey = rest.length >= 2 ? rest[0] : stem;
      if (id == null) { if (!lv.stems.has(stemKey)) lv.stems.set(stemKey, qs.size + 1); id = lv.stems.get(stemKey); }
      if (!qs.has(id)) qs.set(id, { id, key: `L${points}-${id}`, question: null, answer: null, stem: stemKey });
      const p = filePath(genre, r);
      if (isAnswer(file)) qs.get(id).answer = p; else qs.get(id).question = p;
    });
    genre.levels = [...levels.values()].sort((a, b) => a.points - b.points)
      .map((l) => ({ points: l.points, label: l.label, questions: [...l.questions.values()].sort((a, b) => a.id - b.id) }));
  }

  async function loadRound(name) {
    const got = await roundFiles(name);
    if (!got) return { name, genres: [], source: null, error: 'フォルダ一覧を取得できません' };
    return { name, genres: buildRound(name, got.files), source: got.source, fileCount: got.files.length };
  }

  const textCache = new Map();
  async function loadText(url) {
    if (textCache.has(url)) return textCache.get(url);
    try { const r = await fetch(url, { cache: 'no-store' }); const t = r.ok ? (await r.text()).trim() : null; textCache.set(url, t); return t; } catch (e) { textCache.set(url, null); return null; }
  }

  window.QuizLoader = { discoverRounds, loadRound, loadText, BASE, LIST, parse: buildRound };
})();
