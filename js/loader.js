/* フォルダ構成の読み込み（ローダー v3）─ 回 → ジャンル →（サブジャンル）→（級）→ 問題 をフォルダ名・ファイル名から組み立てる
 * 規則は media/README.md。parse() は純関数（fetch しない）なので Node から実データを検査できる（scripts/check_media.mjs）。 */
(function () {
  'use strict';
  const CFG = window.QUIZ_CONFIG || {};
  const CANDIDATES = (Array.isArray(CFG.mediaBases) && CFG.mediaBases.length ? CFG.mediaBases : [CFG.mediaBase || 'media']).map((b) => String(b).replace(/\/+$/, ''));
  let BASE = CANDIDATES[0];
  const LIST = CFG.listFileName || '読み込み用ファイル.txt';
  const TIER_POINTS = Array.isArray(CFG.tierPoints) && CFG.tierPoints.length ? CFG.tierPoints.slice() : [5, 2, 1];
  const LEVELS = CFG.levels || { 上級: 1, 中級: 2, 初級: 3 };

  const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg|flac)$/i;
  const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;
  const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;
  const TEXT_EXT = /\.txt$/i;
  const CATEGORY_TYPES = [[/音声|イントロ|アウトロ/, 'audio'], [/歌詞/, 'audio'], [/動画|映像/, 'video'], [/文章|画像|1枚絵/, 'image']];
  const DEFAULT_CATEGORY = { audio: '楽曲・音声', video: '動画', image: '文章', mixed: '文章' };
  const CATEGORY_ORDER = ['楽曲・音声', '楽曲・歌詞', '動画', '文章'];

  /* ---------- 名前の正規化 ---------- */
  // 照合用の名前：NFC ＋ 全角数字だけ半角に（① などの丸数字は残す）。URL は元の名前で作る
  const nfc = (s) => String(s == null ? '' : s).normalize('NFC');
  const norm = (s) => nfc(s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const SEP = '[_ 　-]';
  const isSep = (c) => c === '_' || c === ' ' || c === '　' || c === '-';
  // 前後の区切りを落とす。正規表現の「SEP+$」は長い区切りの列で何度も戻って遅くなるので、1 回の走査で行う
  function trimSep(s) { let a = 0, b = s.length; while (a < b && isSep(s[a])) a++; while (b > a && isSep(s[b - 1])) b--; return s.slice(a, b); }
  // 末尾の数字（なければ null）。/(\d+)$/ の代わりの線形走査
  function tailNumber(s) { let i = s.length; while (i > 0 && s.charCodeAt(i - 1) >= 48 && s.charCodeAt(i - 1) <= 57) i--; return i < s.length ? parseInt(s.slice(i), 10) : null; }
  const extOf = (name) => { const m = name.match(/\.([^./]+)$/); return m ? m[1].toLowerCase() : ''; };
  const dropExt = (name) => name.replace(/\.[^./]+$/, '');
  const kindOfFile = (name) => AUDIO_EXT.test(name) ? 'audio' : VIDEO_EXT.test(name) ? 'video' : IMAGE_EXT.test(name) ? 'image' : TEXT_EXT.test(name) ? 'text' : null;
  const naturalCmp = (a, b) => String(a).localeCompare(String(b), 'ja', { numeric: true });

  const u = (path, base) => (base == null ? BASE : base) + (path ? '/' + String(path).split('/').map(encodeURIComponent).join('/') : '');
  // 「.」「_」で始まるフォルダは中身ごと無視
  const hiddenDir = (name) => !name || name.startsWith('.') || name.startsWith('_');
  // 「.」で始まるファイルと一覧ファイルは無視。「_」で始まるファイルは .txt（メモ）だけ残す
  const hiddenFile = (name) => !name || name.startsWith('.') || nfc(name) === nfc(LIST) || (name.startsWith('_') && !TEXT_EXT.test(name));
  const numberOf = (s) => { const m = norm(s).match(/(\d+)/); return m ? parseInt(m[1], 10) : null; };

  /* ---------- 取得（ブラウザ／Node の --url モード） ---------- */
  async function fetchText(path, base) {
    try { const r = await fetch(u(path, base), { cache: 'no-store' }); if (!r.ok) return null; return await r.text(); } catch (e) { return null; }
  }
  // サーバー（python3 -m http.server など）が返すフォルダ一覧の HTML を読む
  async function fetchListing(dirPath, base) {
    try {
      const r = await fetch(u(dirPath, base) + '/', { cache: 'no-store' });
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
  // フォルダ一覧をたどる。訪れたフォルダは「名前/」の行で返す（空フォルダを警告に出すため）。
  // 読めなかった所は印の行で返す：「フォルダ/#unreadable」＝一覧を取得できなかった、「フォルダ/#too-deep」＝深さの上限でその中のフォルダを読んでいない
  // （印の行も「/」で終わらないのでファイル扱いの古いコードにも壊れない。parse() が too-deep / unreadable の警告にする）
  const MARK_TOO_DEEP = '#too-deep', MARK_UNREADABLE = '#unreadable';
  async function walk(dir, depth, base) {
    const entries = await fetchListing(dir, base);
    if (!entries) return null;
    const out = [], dirs = [];
    let tooDeep = false;
    entries.forEach((e) => {
      const p = dir ? dir + '/' + e.name : e.name;
      if (e.isDir) { if (hiddenDir(e.name)) return; if (depth > 0) dirs.push(p); else tooDeep = true; }
      else if (!e.name.startsWith('.')) out.push(p);
    });
    const subs = await Promise.all(dirs.map((d) => walk(d, depth - 1, base)));
    subs.forEach((s, i) => { out.push(dirs[i] + '/'); if (s) out.push(...s); else out.push(dirs[i] + '/' + MARK_UNREADABLE); });
    if (tooDeep) out.push((dir ? dir + '/' : '') + MARK_TOO_DEEP);
    return out;
  }

  /* ---------- 回の一覧と読み込み元 ---------- */
  function sortNatural(names) {
    return names.slice().sort((a, b) => { const na = numberOf(a), nb = numberOf(b); if (na != null && nb != null && na !== nb) return na - nb; return a.localeCompare(b, 'ja'); });
  }
  const cleanLine = (l) => l.trim().replace(/\\/g, '/').replace(/^\.?\//, '');
  async function roundsAt(base) {
    const txt = await fetchText(LIST, base);
    if (txt != null) {
      const names = new Set();
      txt.split(/\r?\n/).forEach((l) => { l = cleanLine(l); if (!l || l.startsWith('#')) return; const first = l.split('/')[0]; if (!hiddenDir(first)) names.add(first); });
      if (names.size) return { rounds: [...names], source: 'list' };
    }
    const entries = await fetchListing('', base);
    if (entries) {
      const dirs = entries.filter((e) => e.isDir && !hiddenDir(e.name)).map((e) => e.name);
      if (dirs.length) return { rounds: dirs, source: 'listing' };
      return { rounds: [], source: 'listing', reason: 'フォルダ一覧に回のフォルダがありません' };
    }
    const found = []; let misses = 0;
    for (let i = 1; i <= (CFG.maxRounds || 30) && misses < 3; i++) {
      const name = `第${i}回`;
      const ok = (await fetchText(name + '/' + LIST, base)) != null || (await fetchListing(name, base)) != null;
      if (ok) { found.push(name); misses = 0; } else misses++;
    }
    return { rounds: found, source: 'probe', reason: found.length ? '' : '一覧ファイルもフォルダ一覧も読めません' };
  }
  let resolved = null; const tried = []; const rawRound = new Map();
  // 候補の場所を順に調べ、回フォルダが 1 つ以上見つかった最初の場所を使う
  async function resolveBase() {
    if (resolved) return resolved;
    tried.length = 0;
    for (const cand of CANDIDATES) {
      const r = await roundsAt(cand);
      if (r.rounds.length) {
        tried.push({ base: cand, ok: true, reason: `${r.source}：${r.rounds.length} 回` });
        BASE = cand; resolved = r; break;
      }
      tried.push({ base: cand, ok: false, reason: r.reason || '回のフォルダがありません' });
    }
    if (!resolved) { BASE = CANDIDATES[0]; resolved = { rounds: [], source: null }; }
    resolved.rounds.forEach((n) => rawRound.set(nfc(n), n));
    return resolved;
  }
  async function discoverRounds() {
    const r = await resolveBase();
    return { rounds: sortNatural(r.rounds.map(nfc)), source: r.source };
  }
  const baseInfo = () => ({ base: BASE, tried: tried.map((t) => Object.assign({}, t)) });

  // 行の先頭が prefix（NFC で比べる）なら、それを取り除いた残りを返す。NFD の行は元の文字数が NFC の prefix より長いので、長さではなく NFC が一致する位置で切る。
  // 残りは元の綴りのまま（URL は元の名前で作るため）。合わなければ null
  function stripPrefix(line, prefix) {
    const p = nfc(prefix);
    if (!nfc(line).startsWith(p)) return null;
    for (let k = Math.min(p.length, line.length); k <= line.length; k++) if (nfc(line.slice(0, k)) === p) return line.slice(k);
    return nfc(line).slice(p.length);
  }
  async function roundFiles(round) {
    const txt = await fetchText(round + '/' + LIST);
    if (txt != null) {
      const files = [];
      txt.split(/\r?\n/).forEach((l) => {
        l = cleanLine(l);
        if (!l || l.startsWith('#')) return;
        let rest = stripPrefix(l, round + '/');
        if (rest == null) rest = stripPrefix(l, BASE + '/' + round + '/');
        files.push(rest != null ? rest : l);
      });
      return { files, source: 'list' };
    }
    const walked = await walk(round, 4);
    if (walked) return { files: walked.map((f) => f.slice(round.length + 1)), source: 'listing' };
    return null;
  }

  /* ---------- 名前の解釈 ---------- */
  function parseGenreName(folder) {
    let parts = norm(folder).split('_');
    let order = null;
    if (parts.length >= 2 && /^\d+$/.test(parts[0])) { order = parseInt(parts[0], 10); parts = parts.slice(1); }
    if (parts.length >= 3) return { order, category: parts[0], name: parts.slice(1, -1).join('_'), modeLabel: parts[parts.length - 1] };
    if (parts.length === 2) return { order, category: parts[0], name: parts[1], modeLabel: '' };
    return { order, category: '', name: parts[0], modeLabel: '' };
  }
  const scoringOfLabel = (label) => /点数/.test(label) ? 'points' : /減点|逆転/.test(label) ? 'deduct' : null;

  // 問題フォルダ：第N問 / N / 問題N、続けて _減点方式・_点数方式・_逆転・_N点（組み合わせ可）
  // 接尾辞が食い違うときは 並びに関係なく 逆転 ＞ 減点方式 ＞ 点数方式・N点 の順に採り、conflict に理由を入れる（警告 suffix-conflict の元）
  //  ・逆転は減点＋clips。点数方式／N点とは両立しない　・減点方式と 点数方式／N点 も両立しない　・N点が複数あるときは最初のもの
  function parseQuestionFolder(name) {
    const s = norm(name).trim();
    const m = s.match(/^(?:第)?(\d+)問?(?=$|[_ 　-])/) || s.match(/^問題(\d+)(?=$|[_ 　-])/);
    if (!m) return null;
    // marked：「第」「問」が付いている（第N問・N問・問題N）。裸の「N」「N_…」は marked でない
    const out = { id: parseInt(m[1], 10), form: /^問題/.test(s) ? 'mondai' : 'dai', marked: /[第問]/.test(m[0]), scoring: null, reverse: false, fixedPoints: null, suffixLabel: '', unknown: [], conflict: [] };
    const rest = trimSep(s.slice(m[0].length));
    if (!rest) return out;
    const found = []; // { cls: 'reverse' | 'deduct' | 'points' | 'fixed', label, value? }
    rest.split(new RegExp(SEP + '+')).filter(Boolean).forEach((part) => {
      const pm = part.match(/^(\d+)点$/);
      if (pm) found.push({ cls: 'fixed', label: part, value: parseInt(pm[1], 10) });
      else if (/逆転/.test(part)) found.push({ cls: 'reverse', label: '逆転' });
      else if (/減点/.test(part)) found.push({ cls: 'deduct', label: part });
      else if (/点数/.test(part)) found.push({ cls: 'points', label: part });
      else out.unknown.push(part);
    });
    const has = (...cls) => found.some((f) => cls.includes(f.cls));
    out.reverse = has('reverse');
    if (has('reverse', 'deduct')) out.scoring = 'deduct';
    else if (has('points', 'fixed')) out.scoring = 'points';
    else if (out.unknown.length) out.scoring = 'deduct';
    const keep = out.scoring === 'deduct' ? ['reverse', 'deduct'] : ['points', 'fixed'];
    const loser = found.filter((f) => !keep.includes(f.cls));
    if (has('reverse', 'deduct') && has('points', 'fixed')) {
      out.conflict.push(`${out.reverse ? '逆転' : '減点方式'}と ${loser.map((f) => f.label).join('・')} は両立しません → ${out.reverse ? '逆転（減点）' : '減点方式'}として読みます`);
    }
    const fixeds = found.filter((f) => f.cls === 'fixed');
    if (out.scoring === 'points' && fixeds.length) {
      out.fixedPoints = fixeds[0].value;
      if (new Set(fixeds.map((f) => f.value)).size > 1) out.conflict.push(`点数が複数あります（${fixeds.map((f) => f.label).join('・')}）→ 最初の ${fixeds[0].label} を使います`);
    }
    const shown = [];
    let seenFixed = false;
    found.forEach((f) => { if (!keep.includes(f.cls)) return; if (f.cls === 'fixed') { if (seenFixed) return; seenFixed = true; } shown.push(f.label); });
    out.suffixLabel = shown.join('_');
    return out;
  }

  // フォルダを問題フォルダとして読むか（読むなら parseQuestionFolder の結果、読まないなら null ＝サブジャンル）
  //  ・接尾辞が無い／全部知っている接尾辞（減点・点数・逆転・N点）→ 問題フォルダ
  //  ・知らない接尾辞：「第N問_…」「問題N_…」でサブフォルダが無いときだけ問題フォルダ（警告して減点扱い）。
  //    「01_サブ」「1 サブ」のような先頭が数字だけの名前や、サブフォルダを持つものはサブジャンル（数字は並び順に使う）
  function questionFolderOf(name, hasSubdirs) {
    const q = parseQuestionFolder(name);
    if (!q) return null;
    if (!q.unknown.length) return q;
    return q.marked && !hasSubdirs ? q : null;
  }

  // ファイル名から印を 1 つだけ取る：答えの語 or 問題側の語 ＞ 段階（①〜⑳・㉑〜㉟・_verN）
  // 正規表現（[区切り]*語$ や (^|[区切り]+)ver\d+）は長い区切りの列で何度も戻るので、前後からの 1 回の走査で書いている
  const ANSWER_WORDS = ['解答', '回答', '正解', '答え', 'answer'];
  const QUESTION_WORDS = ['問題', 'question'];
  // 末尾の語（前の区切りごと）。strict のときは語の前が区切りか名前の先頭でなければ印にしない。見つかれば幹の終わりの位置、なければ -1
  function tailWord(base, words, strict) {
    for (const w of words) {
      const at = base.length - w.length;
      if (at < 0 || base.slice(at).toLowerCase() !== w) continue;
      let cut = at; while (cut > 0 && isSep(base[cut - 1])) cut--;
      if (strict && cut === at && at > 0) continue;
      return cut;
    }
    return -1;
  }
  // 先頭の語（後ろの区切りごと）。見つかれば幹の始まりの位置、なければ -1
  function headWord(base, words) {
    for (const w of words) {
      if (base.length < w.length || base.slice(0, w.length).toLowerCase() !== w) continue;
      let e = w.length; while (e < base.length && isSep(base[e])) e++;
      return e;
    }
    return -1;
  }
  // 「[区切り]+ver1」「ver12」（名前の先頭か区切りの直後で、数字は 1〜2 桁）。見つかれば { index（前の区切りの頭）, end, n }
  function findVer(base) {
    for (let p = 0; p + 3 < base.length; p++) {
      if (p > 0 && !isSep(base[p - 1])) continue;
      if (base.slice(p, p + 3).toLowerCase() !== 'ver') continue;
      let e = p + 3; while (e < base.length && e - p - 3 < 3 && base.charCodeAt(e) >= 48 && base.charCodeAt(e) <= 57) e++;
      const d = e - p - 3;
      if (d < 1 || d > 2) continue;
      let s = p; while (s > 0 && isSep(base[s - 1])) s--;
      return { index: s, end: e, n: parseInt(base.slice(p + 3, e), 10) };
    }
    return null;
  }
  // strict：.txt に使う。答え／問題／段階の印は「名前の先頭、または _ 空白 - の直後」にあるときだけ印にする（曲名の途中の ① や末尾の「答え」は印にしない）。
  // 先頭が「_」の .txt は段階にしない（_曲名.txt はメモ）
  function classify(fileName, strict) {
    const base = dropExt(norm(fileName));
    let cut;
    if ((cut = tailWord(base, ANSWER_WORDS, strict)) >= 0) return { marker: 'answer', n: null, stem: trimSep(base.slice(0, cut)) };
    if ((cut = headWord(base, ANSWER_WORDS)) >= 0) return { marker: 'answer', n: null, stem: trimSep(base.slice(cut)) };
    if ((cut = tailWord(base, QUESTION_WORDS, strict)) >= 0) return { marker: 'question', n: null, stem: trimSep(base.slice(0, cut)) };
    if (!(strict && fileName.startsWith('_'))) {
      for (let i = base.length - 1; i >= 0; i--) {
        const c = base.charCodeAt(i);
        let n = null;
        if (c >= 0x2460 && c <= 0x2473) n = c - 0x2460 + 1;
        else if (c >= 0x3251 && c <= 0x325F) n = c - 0x3251 + 21;
        if (n == null) continue;
        if (strict && i > 0 && !isSep(base[i - 1])) continue;
        return { marker: 'stage', n, stem: trimSep(base.slice(0, i) + base.slice(i + 1)) };
      }
      const v = findVer(base);
      if (v) return { marker: 'stage', n: v.n, stem: trimSep(base.slice(0, v.index) + base.slice(v.end)) };
    }
    return { marker: null, n: null, stem: trimSep(base) };
  }
  const levelOf = (name) => {
    const k = norm(name).trim();
    if (!Object.hasOwn(LEVELS, k)) return null; // 'constructor' などの継承プロパティは級ではない
    const rank = LEVELS[k];
    return rank ? { label: k, rank, points: TIER_POINTS[rank - 1] != null ? TIER_POINTS[rank - 1] : null } : null;
  };

  /* ---------- 回の組み立て（純関数） ---------- */
  // files：回フォルダからの相対パス。末尾が「/」の行はフォルダ（空フォルダを見つけるため）
  function parse(roundName, files, opts) {
    const base = (opts && opts.base != null) ? String(opts.base).replace(/\/+$/, '') : BASE;
    const round = nfc(roundName);
    const warnings = [];
    const warn = (list, type, path, message) => { const w = { type, path, message }; list.push(w); return w; };

    const relOf = (segs) => segs.map(nfc).join('/');
    const srcOf = (segs) => u([roundName].concat(segs).join('/'), base);

    // 木を作る（ノード：raw 名、照合名、子フォルダ、ファイル、読み込み時の警告 marks、中身を全部は読めていない印 incomplete）
    const newNode = (raw, parent) => ({ raw, name: nfc(raw), dirs: new Map(), files: [], parent, segs: parent ? parent.segs.concat(raw) : [], marks: [], variants: new Set([nfc(raw)]), incomplete: false });
    const root = newNode(roundName, null);
    root.name = round;
    const nodeFor = (segs) => {
      let node = root;
      for (const s of segs) {
        const k = norm(s);
        let child = node.dirs.get(k);
        if (!child) { child = newNode(s, node); node.dirs.set(k, child); }
        else if (!child.variants.has(nfc(s))) {
          // 第1問 と 第１問 のように、照合名（全角数字を半角にしたもの）が同じ別名のフォルダ：1 つにまとめて読む
          node.marks.push({ type: 'duplicate-name', path: relOf(child.segs), message: `同じ名前として読むフォルダが複数あります（「${[...child.variants].join('」「')}」と「${nfc(s)}」）→ 1 つにまとめて読みます` });
          child.variants.add(nfc(s));
        }
        node = child;
      }
      return node;
    };
    let fileCount = 0;
    (files || []).forEach((line) => {
      const l = String(line).replace(/\\/g, '/').replace(/^\.?\//, '');
      if (!l.trim()) return;
      const isDir = l.endsWith('/');
      const segs = l.split('/').filter(Boolean);
      if (!segs.length) return;
      const last = segs[segs.length - 1];
      // 印の行（walk() が出す）：「フォルダ/#too-deep」「フォルダ/#unreadable」
      if (!isDir && (last === MARK_TOO_DEEP || last === MARK_UNREADABLE)) {
        const ds = segs.slice(0, -1);
        if (ds.some(hiddenDir)) return;
        const node = nodeFor(ds);
        node.incomplete = true;
        const type = last === MARK_TOO_DEEP ? 'too-deep' : 'unreadable';
        if (!node.marks.some((m) => m.type === type)) {
          node.marks.push({ type, path: relOf(node.segs) || round, message: type === 'too-deep' ? 'フォルダが深すぎて、この中のフォルダは読んでいません（ジャンルの下は 3 段まで）' : 'フォルダの一覧を取得できず、中身を読んでいません' });
        }
        return;
      }
      const dirSegs = isDir ? segs : segs.slice(0, -1);
      if (dirSegs.some(hiddenDir)) return;
      const node = nodeFor(dirSegs);
      if (isDir) return;
      const name = last;
      if (hiddenFile(name)) return;
      const same = node.files.find((f) => norm(f.raw) === norm(name));
      if (same) {
        if (same.name !== nfc(name)) node.marks.push({ type: 'duplicate-name', path: relOf(segs), message: `同じ名前として読むファイルが複数あります（「${same.name}」と「${nfc(name)}」）→ 後のものは読みません` });
        return;
      }
      node.files.push({ raw: name, name: nfc(name), norm: norm(name), segs });
      fileCount++;
    });
    root.marks.forEach((m) => warn(warnings, m.type, m.path, m.message));

    // 回フォルダ直下のファイルは割り当て先が無い
    root.files.forEach((f) => warn(warnings, 'unassigned', relOf(f.segs), 'ジャンルのフォルダの外にあるファイル'));

    const genres = [];
    for (const gnode of root.dirs.values()) {
      const meta = parseGenreName(gnode.raw);
      const genre = {
        id: gnode.name, folder: gnode.raw, order: meta.order, name: meta.name,
        category: meta.category, scoring: scoringOfLabel(meta.modeLabel), scoringLabel: meta.modeLabel || undefined,
        type: null, round, base: u([roundName, gnode.raw].join('/'), base),
        questions: [], sections: [], summary: null, warnings: [],
      };
      const gw = genre.warnings;
      const usedKeys = new Map();

      // 読めなかった所（too-deep / unreadable）は「空」ではない：その警告だけを出す
      const emptyCheck = (node) => { if (!node.incomplete) warn(gw, 'empty', relOf(node.segs), '空のフォルダ（画面には出しません）'); };

      // 葉（媒体ファイルを直接持つフォルダ）を処理する
      const processLeaf = (node, ctx) => {
        const notes = [], items = [];
        node.files.forEach((f) => {
          const kind = kindOfFile(f.raw);
          const c = classify(f.raw, kind === 'text');
          if (kind === 'text' && c.marker !== 'stage' && c.marker !== 'answer') notes.push(f);
          else if (kind) items.push(Object.assign({ kind }, f, c));
          else warn(gw, 'unassigned', relOf(f.segs), '媒体として読めない拡張子');
        });
        if (!items.length) {
          notes.forEach((f) => { if (!f.raw.startsWith('_')) warn(gw, 'unassigned', relOf(f.segs), '媒体ファイルの無いフォルダのメモ'); });
          return;
        }
        const stems = new Map();
        items.forEach((it) => { const k = it.stem.toLowerCase(); if (!stems.has(k)) stems.set(k, { stem: it.stem, items: [] }); stems.get(k).items.push(it); });
        const stemList = [...stems.values()].sort((a, b) => naturalCmp(a.stem, b.stem));
        const folderQ = node === gnode ? null : questionFolderOf(node.raw, node.dirs.size > 0);
        if (folderQ && folderQ.unknown.length) {
          warn(gw, 'unknown-suffix', relOf(node.segs), `問題フォルダの知らない接尾辞（${folderQ.unknown.join('・')}）→ 減点方式として読みます`);
        }
        if (folderQ) folderQ.conflict.forEach((msg) => warn(gw, 'suffix-conflict', relOf(node.segs), `問題フォルダの接尾辞が食い違っています：${msg}`));
        if (stemList.length === 1) {
          const tail = tailNumber(stemList[0].stem);
          const id = folderQ ? folderQ.id : tail != null ? tail : 1;
          const label = folderQ && folderQ.form === 'dai' ? `第${id}問` : `問題${id}`;
          buildQuestion(stemList[0], { node, ctx, id, label, folderQ, notes, multi: false });
        } else {
          if (notes.length) warn(gw, 'multi-stem-note', relOf(node.segs), `幹が ${stemList.length} 個あるフォルダのメモはどの問題にも付けません`);
          const tails = stemList.map((s) => tailNumber(s.stem));
          const useTails = tails.every((t) => t != null) && new Set(tails).size === tails.length;
          stemList.forEach((s, i) => {
            const id = useTails ? tails[i] : i + 1;
            // 番号付きの問題フォルダ（第5問 など）の中に幹が複数：キーは「<フォルダの番号>-<何番目か>」（他の問題フォルダの 1, 2 とぶつけない）
            const keyId = folderQ ? `${folderQ.id}-${i + 1}` : null;
            buildQuestion(s, { node, ctx, id, keyId, label: `問題${id}`, folderQ: folderQ ? Object.assign({}, folderQ, { id: null }) : null, notes: [], multi: true });
          });
        }
      };

      const buildQuestion = (sg, o) => {
        const qw = [];
        const leafPath = relOf(o.node.segs);
        let stages = sg.items.filter((it) => it.marker === 'stage');
        const qs = sg.items.filter((it) => it.marker === 'question');
        const as = sg.items.filter((it) => it.marker === 'answer');
        const unmarked = sg.items.filter((it) => it.marker === null);
        const extra = [];
        let pairQ = null;
        if (!stages.length) {
          const qv = qs.find((it) => it.kind === 'video');
          const qo = qs.find((it) => it.kind !== 'video');
          if (qv) pairQ = qv;
          else if (qo) stages = [Object.assign({}, qo, { n: 1 })]; // 「問題」と付いた画像・音声は ① とみなす
          qs.forEach((it) => { if (it !== pairQ && !(stages[0] && stages[0].raw === it.raw)) extra.push(it); });
        } else qs.forEach((it) => extra.push(it));
        const answerVideo = as.find((it) => it.kind === 'video');
        const isPair = !stages.length && (pairQ || answerVideo);
        if (!stages.length && !isPair) {
          sg.items.forEach((it) => warn(gw, 'unassigned', relOf(it.segs), '段階（①…）も問題動画も無い幹のファイル'));
          return;
        }
        unmarked.forEach((it) => extra.push(it));
        const answer = { image: null, audio: null, video: null, text: null, textSrc: null };
        as.forEach((it) => {
          const slot = it.kind === 'text' ? 'textSrc' : it.kind;
          if (answer[slot]) extra.push(it); else answer[slot] = srcOf(it.segs);
        });
        extra.forEach((it) => warn(qw, 'unassigned', relOf(it.segs), '問題のどこにも当てはまらないファイル'));

        stages.sort((a, b) => a.n - b.n || naturalCmp(a.name, b.name));
        const seen = new Set();
        stages = stages.filter((s) => { if (seen.has(s.n)) { warn(qw, 'unassigned', relOf(s.segs), `段階 ${s.n} が重複`); return false; } seen.add(s.n); return true; });
        if (stages.length && stages.some((s, i) => s.n !== i + 1)) warn(qw, 'stage-gap', leafPath, `段階の番号が抜けています（${stages.map((s) => s.n).join(',')}）`);
        const fmts = [...new Set(stages.map((s) => s.kind))];
        if (fmts.length > 1) warn(qw, 'mixed-media', leafPath, `ヒントの媒体が混在（${fmts.join('・')}）`);
        const counts = {}; stages.forEach((s) => { counts[s.kind] = (counts[s.kind] || 0) + 1; });
        const format = isPair ? 'video' : (Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || null);

        const notes = o.notes.map((f) => ({ name: f.name, src: srcOf(f.segs) }));
        if (o.notes.length) {
          answer.text = trimSep(dropExt(o.notes[0].name).replace(/^_+/, '')) || null;
          if (!answer.textSrc) answer.textSrc = notes[0].src;
        }
        const pair = isPair ? { question: pairQ ? srcOf(pairQ.segs) : null, answer: answerVideo ? srcOf(answerVideo.segs) : null } : null;
        const hasAnswerMedia = !!(answer.image || answer.audio || answer.video);
        if (!hasAnswerMedia && !answer.text && !answer.textSrc) warn(qw, 'no-answer', leafPath, '解答ファイルもメモ（曲名 txt）もありません');
        if (pair && !pair.question) warn(qw, 'no-answer', leafPath, '問題動画がありません（正解動画のみ）');

        // 方式：問題フォルダの接尾辞 ＞ 級フォルダ ＞ ジャンルの接尾辞 ＞ 推定
        const level = o.ctx.level;
        let scoring, scoringSource, scoringLabel;
        if (o.folderQ && o.folderQ.scoring) { scoring = o.folderQ.scoring; scoringSource = 'suffix'; scoringLabel = o.folderQ.suffixLabel || (scoring === 'points' ? '点数方式' : '減点方式'); }
        else if (level) { scoring = 'points'; scoringSource = 'level'; scoringLabel = '点数方式'; }
        else if (genre.scoring) { scoring = genre.scoring; scoringSource = 'genre'; scoringLabel = meta.modeLabel; }
        else { scoring = stages.length >= 2 ? 'deduct' : 'points'; scoringSource = 'guess'; scoringLabel = scoring === 'points' ? '点数方式' : '減点方式'; }

        const reverse = !!(o.folderQ && o.folderQ.reverse);
        const mode = isPair ? 'pair' : (reverse || (format === 'audio' && stages.length > TIER_POINTS.length && !hasAnswerMedia)) ? 'clips' : 'staged';
        const fixed = o.folderQ && o.folderQ.fixedPoints != null ? o.folderQ.fixedPoints : null;
        const pointsValue = scoring === 'points' ? (fixed != null ? fixed : level ? level.points : null) : null;
        const points = stages.map((s) => scoring === 'deduct' ? (TIER_POINTS[s.n - 1] != null ? TIER_POINTS[s.n - 1] : null) : pointsValue);
        let tierRank = null;
        if (scoring === 'points') { if (fixed != null) { const i = TIER_POINTS.indexOf(fixed); tierRank = i >= 0 ? i + 1 : null; } else if (level) tierRank = level.rank; }

        let kind = o.multi ? null : (sg.stem.replace(/^\d+/, '').replace(new RegExp('^' + SEP + '+'), '') || null);
        if (kind && answer.text && norm(kind) === norm(answer.text)) kind = null; // 答えと同じ文字はカードに出さない

        const group = o.ctx.groups.length ? o.ctx.groups.join('/') : null;
        let key = [group, level ? level.label : null, String(o.keyId != null ? o.keyId : o.id)].filter((x) => x != null).join('~');
        if (usedKeys.has(key)) {
          let i = 2; while (usedKeys.has(`${key}#${i}`)) i++;
          warn(qw, 'duplicate-key', leafPath, `問題の番号が重複（${key}）→ ${key}#${i} として読みます`);
          key = `${key}#${i}`;
        }
        usedKeys.set(key, true);

        const q = {
          key, id: o.id, label: o.label, kind, stem: sg.stem, group, level,
          scoring, scoringSource, scoringLabel, mode, format,
          stages: stages.map((s) => ({ n: s.n, src: srcOf(s.segs), name: s.name, format: s.kind })),
          pair, answer, notes, points, pointsValue, tierRank,
          folder: leafPath, warnings: qw,
        };
        genre.questions.push(q);
        qw.forEach((w) => gw.push(w));
      };

      // ジャンルから葉までたどる。級の名前なら level、問題フォルダ（questionFolderOf）でなければ group
      const visit = (node, ctx) => {
        node.marks.forEach((m) => warn(gw, m.type, m.path, m.message));
        if (node.files.length) processLeaf(node, ctx);
        else if (!node.dirs.size) { emptyCheck(node); return; }
        const lvOrder = (n) => { const lv = levelOf(n.raw); return lv ? -lv.rank : 0; };
        const subs = [...node.dirs.values()].sort((a, b) => (lvOrder(a) - lvOrder(b)) || naturalCmp(a.name, b.name));
        subs.forEach((child) => {
          const lv = levelOf(child.raw);
          let next;
          if (lv) next = { groups: ctx.groups, level: lv };
          else if (questionFolderOf(child.raw, child.dirs.size > 0)) next = ctx;
          else next = { groups: ctx.groups.concat(norm(child.raw)), level: ctx.level };
          visit(child, next);
        });
      };
      visit(gnode, { groups: [], level: null });

      // 並び：group（先頭の数字→名前）→ 級（初級→中級→上級）→ 番号
      const groupCmp = (a, b) => {
        if (a === b) return 0; if (a == null) return -1; if (b == null) return 1;
        const pa = /^\d/.test(norm(a)) ? numberOf(a) : null, pb = /^\d/.test(norm(b)) ? numberOf(b) : null;
        if (pa != null && pb != null && pa !== pb) return pa - pb;
        if (pa != null && pb == null) return -1; if (pb != null && pa == null) return 1;
        return a.localeCompare(b, 'ja');
      };
      const levelKey = (lv) => lv ? -lv.rank : -999;
      genre.questions.sort((a, b) => groupCmp(a.group, b.group) || (levelKey(a.level) - levelKey(b.level)) || (a.id - b.id) || naturalCmp(a.key, b.key));

      // 見出し（group × level）ごとの区切り
      genre.questions.forEach((q) => {
        const last = genre.sections[genre.sections.length - 1];
        const lvLabel = q.level ? q.level.label : null;
        if (last && last.group === q.group && (last.level ? last.level.label : null) === lvLabel) last.keys.push(q.key);
        else genre.sections.push({ group: q.group, level: q.level, keys: [q.key] });
      });

      const fmts = [...new Set(genre.questions.map((q) => q.format).filter(Boolean))];
      let typeFromCat = null;
      for (const [re, t] of CATEGORY_TYPES) if (re.test(meta.category)) { typeFromCat = t; break; }
      genre.type = fmts.length > 1 ? 'mixed' : fmts[0] || typeFromCat || 'image';
      const fc = {}; genre.questions.forEach((q) => { if (q.format) fc[q.format] = (fc[q.format] || 0) + 1; });
      genre.majorFormat = Object.keys(fc).sort((a, b) => fc[b] - fc[a])[0] || typeFromCat || 'image';
      if (!genre.category) genre.category = DEFAULT_CATEGORY[genre.type] || '文章';
      if (!genre.scoring) {
        const d = genre.questions.filter((q) => q.scoring === 'deduct').length;
        genre.scoring = d >= genre.questions.length - d ? 'deduct' : 'points';
      }
      const byRank = {};
      genre.questions.forEach((q) => { if (q.scoring === 'points') { const k = q.tierRank || 0; byRank[k] = (byRank[k] || 0) + 1; } });
      genre.summary = {
        total: genre.questions.length,
        deduct: genre.questions.filter((q) => q.scoring === 'deduct').length,
        points: genre.questions.filter((q) => q.scoring === 'points').length,
        pointsByRank: byRank,
        modes: genre.questions.reduce((m, q) => { m[q.mode] = (m[q.mode] || 0) + 1; return m; }, {}),
      };
      gw.forEach((w) => warnings.push(Object.assign({ genre: genre.id }, w)));
      if (genre.questions.length) genres.push(genre);
    }

    genres.sort((a, b) => {
      if (a.order != null || b.order != null) { if (a.order == null) return 1; if (b.order == null) return -1; if (a.order !== b.order) return a.order - b.order; }
      const ca = CATEGORY_ORDER.findIndex((c) => a.category.startsWith(c)), cb = CATEGORY_ORDER.findIndex((c) => b.category.startsWith(c));
      if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
      return a.id.localeCompare(b.id, 'ja');
    });
    return { name: round, raw: roundName, genres, warnings, fileCount, base };
  }

  async function loadRound(name) {
    await resolveBase();
    const raw = rawRound.get(nfc(name)) || name;
    const got = await roundFiles(raw);
    if (!got) return { name: nfc(name), genres: [], warnings: [], source: null, base: BASE, error: 'フォルダ一覧を取得できません' };
    const r = parse(raw, got.files);
    r.source = got.source;
    return r;
  }

  const textCache = new Map();
  async function loadText(url) {
    if (textCache.has(url)) return textCache.get(url);
    try { const r = await fetch(url, { cache: 'no-store' }); const t = r.ok ? (await r.text()).trim() : null; textCache.set(url, t); return t; } catch (e) { textCache.set(url, null); return null; }
  }

  window.QuizLoader = {
    discoverRounds, loadRound, loadText, base: () => BASE, baseInfo, LIST, parse,
    // 検査用（scripts/check_media.mjs・tests）
    _internal: { walk, fetchListing, classify, parseQuestionFolder, questionFolderOf, levelOf, stripPrefix, trimSep, norm, hiddenDir, hiddenFile, TIER_POINTS, LEVELS, MARK_TOO_DEEP, MARK_UNREADABLE },
  };
})();
