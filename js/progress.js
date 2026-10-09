/* 出題の進捗（DOM に依存しない。Node のテストからも new Function で読み込める）
 *
 * localStorage['hasu-quiz-progress-v3'] =
 *   { [round]: { [genreId]: { [key]: { stages: { [n]: true }, clips?: { [n]: true }, answer: bool, played: bool, done: bool } } } }
 *   stages … 出したヒントの段階番号（1 = ①）。逆転（clips）では「その番号の答えを開いた」
 *   clips  … 逆転で流したクリップの番号（markClipPlayed。再読み込みしても済の印が残る。流したことが無ければ無い）
 *   answer … 解答を表示した／回答動画を再生した
 *   played … 何かを再生した（対動画の問題動画、逆転のクリップ）
 *   done   … 手動で出題済にした
 *
 * v3 が無く v2（hasu-quiz-progress-v2）があれば起動時に 1 回だけ移行する（v2 はそのまま残す）。
 * 回・ジャンル・キーは NFC にそろえる（v2 はディスク上の名前のままで、NFD のフォルダ名があった）。
 * 対動画の旧キー L<点>-<id> は番号の振り方が v3 と違うので、いったん '~v2~L<点>-<id>' で持っておき、
 * 回を読み込んだ後に resolveV2Pairs(genre) で v2 と同じ規則で番号を振り直して v3 のキーへ移す。 */
(function (root) {
  'use strict';
  const KEY = 'hasu-quiz-progress-v3';
  const OLD_KEY = 'hasu-quiz-progress-v2';
  const OLD_LEVEL = { 1: '初級', 2: '中級', 3: '上級' };   // v2 の L<点>-<id> の点 → 級
  const OLD_TIER_STAGE = { 3: 1, 2: 2, 1: 3 };            // v2 の 3点/2点/1点 → 段階 ①②③
  const OLD_POINTS = { 初級: 1, 中級: 2, 上級: 3 };       // 級 → v2 の点
  const V2_PAIR = '~v2~';                                 // 未解決の対動画の旧キー（v3 のキーとは重ならない）

  let storage = null;
  let state = {};
  let migrated = false;

  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const range = (a, b) => { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; };

  /* ---------- v2 → v3 ---------- */
  function migrateKey(key) {
    let m = /^q(\d+)$/.exec(key);
    if (m) return { key: String(Number(m[1])), pair: false };
    m = /^L(\d+)-(.+)$/.exec(key);
    if (m && OLD_LEVEL[m[1]]) return { key: V2_PAIR + key, pair: true };
    return { key, pair: false };
  }
  // 同じ問題に 2 つの記録が来たら合わせる（段階は和、answer/played/done はどちらかが true なら true）
  function mergeEntry(a, b) {
    if (!a) return b;
    if (!b) return a;
    const out = { stages: Object.assign({}, a.stages, b.stages) };
    if (a.clips || b.clips) out.clips = Object.assign({}, a.clips, b.clips);
    ['answer', 'played', 'done'].forEach((f) => { if (a[f] || b[f]) out[f] = true; });
    return out;
  }
  function migrateEntry(old, pair) {
    if (!isObj(old)) return null;
    const out = { stages: {} };
    [old.clips, old.lyrics].forEach((tiers) => {
      if (!isObj(tiers)) return;
      Object.keys(tiers).forEach((p) => { if (tiers[p] && OLD_TIER_STAGE[p]) out.stages[OLD_TIER_STAGE[p]] = true; });
    });
    const hint = Number(old.hint);
    if (old.hint != null && Number.isFinite(hint)) {
      if (hint >= 3) out.answer = true;
      range(1, Math.min(hint, 2) + 1).forEach((n) => { out.stages[n] = true; });
    }
    if (old.answer) out.answer = true;
    // 解答まで出した文章・歌詞の問題は ①〜③ も出したことにする（対動画には段階が無い）
    if (out.answer && !pair) range(1, 3).forEach((n) => { out.stages[n] = true; });
    if (old.played) out.played = true;
    if (old.done) out.done = true;
    return out;
  }
  function migrateV2(old) {
    const out = {};
    if (!isObj(old)) return out;
    const nfc = (s) => String(s).normalize('NFC');
    Object.keys(old).forEach((r0) => {
      if (!isObj(old[r0])) return;
      const r = nfc(r0);
      Object.keys(old[r0]).forEach((g0) => {
        if (!isObj(old[r0][g0])) return;
        const g = nfc(g0);
        Object.keys(old[r0][g0]).forEach((k) => {
          const mk = migrateKey(nfc(k));
          const e = migrateEntry(old[r0][g0][k], mk.pair);
          if (!e) return;
          out[r] = out[r] || {};
          out[r][g] = out[r][g] || {};
          out[r][g][mk.key] = mergeEntry(out[r][g][mk.key], e);
        });
      });
    });
    return out;
  }

  /* ---------- 対動画の旧キー（v2 の buildLevels を再現） ----------
   * v2 は級フォルダ直下のファイルをサーバーの一覧の順（http.server：名前を小文字にして符号位置順）に見て、
   * 幹（拡張子と末尾の _問題／_回答／_正解 などを除いた名前）の末尾の数字、無ければ幹が出てきた順で番号を振った。
   * v3 は自然順なので、数字の無い幹では番号がずれる。ここで v2 の番号 → v3 のキーの対応を作る。 */
  const baseName = (src) => { const last = String(src || '').split('/').pop(); try { return decodeURIComponent(last); } catch (e) { return last; } };
  const cmpLower = (a, b) => { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; };
  function v2PairKeys(genre) {
    const map = {};
    const files = {};
    const others = [];
    (genre.questions || []).forEach((q) => {
      if (q.group || !q.level || !OLD_POINTS[q.level.label]) return;
      const pts = OLD_POINTS[q.level.label];
      if (q.mode === 'pair' && q.pair) {
        files[pts] = files[pts] || [];
        [q.pair.question, q.pair.answer].filter(Boolean).forEach((src) => files[pts].push({ name: baseName(src), key: q.key }));
      } else others.push({ pts, id: q.id, key: q.key });   // 級の中の 第N問 フォルダ：v2 もフォルダの番号
    });
    Object.keys(files).forEach((pts) => {
      const ids = new Map(), stems = new Map();
      files[pts].sort((a, b) => cmpLower(a.name, b.name)).forEach(({ name, key }) => {
        const stem = name.replace(/\.[^.]+$/, '').replace(/[_ 　-]*(問題|回答|正解|答え|question|answer)\s*$/i, '');
        const d = stem.match(/(\d+)\s*$/);
        let id = d ? parseInt(d[1], 10) : null;
        if (id == null) { if (!stems.has(stem)) stems.set(stem, ids.size + 1); id = stems.get(stem); }
        if (!ids.has(id)) ids.set(id, key);
      });
      ids.forEach((key, id) => { map[`L${pts}-${id}`] = key; });
    });
    others.forEach(({ pts, id, key }) => { if (!map[`L${pts}-${id}`]) map[`L${pts}-${id}`] = key; });
    return map;
  }
  // 回を読み込んだ後にジャンルごとに呼ぶ。対応する問題が無い旧キーは捨てる（dropped に数える）
  function resolveV2Pairs(genre) {
    const res = { moved: 0, dropped: 0 };
    const g = (state[genre.round] || {})[genre.id];
    if (!isObj(g)) return res;
    const pending = Object.keys(g).filter((k) => k.startsWith(V2_PAIR));
    if (!pending.length) return res;
    const map = v2PairKeys(genre);
    pending.forEach((pk) => {
      const key = map[pk.slice(V2_PAIR.length)];
      if (key) { g[key] = mergeEntry(g[key], g[pk]); res.moved++; } else res.dropped++;
      delete g[pk];
    });
    save();
    return res;
  }

  /* ---------- 読み書き ---------- */
  function defaultStorage() { try { return root.localStorage || null; } catch (e) { return null; } }
  function read(key) { try { return storage ? storage.getItem(key) : null; } catch (e) { return null; } }
  function load(st) {
    storage = st || defaultStorage();
    migrated = false;
    const raw = read(KEY);
    if (raw != null) {
      try { state = JSON.parse(raw); } catch (e) { state = {}; }
      if (!isObj(state)) state = {};
      return state;
    }
    const old = read(OLD_KEY);
    state = {};
    if (old != null) {
      try { state = migrateV2(JSON.parse(old)); migrated = true; } catch (e) { state = {}; }
      save();
    }
    return state;
  }
  // 保存できなかったとき（容量超過・プライベートモードなど）は false を返し、onSaveFail で登録した関数に知らせる
  let saveFailHook = null;
  function onSaveFail(fn) { saveFailHook = typeof fn === 'function' ? fn : null; }
  function save() {
    let ok = false;
    try { if (storage) { storage.setItem(KEY, JSON.stringify(state)); ok = true; } } catch (e) { ok = false; }
    if (!ok && saveFailHook) { try { saveFailHook(); } catch (e) { /* 知らせる側の失敗は無視 */ } }
    return ok;
  }
  // ほかのタブが書き換えたときに、保存されている内容をそのまま読み直す（移行はしない）。
  // 壊れた JSON のときは手元の状態を残す。キーが消えていれば空にする（ほかのタブで全部リセット）
  function reload() {
    const raw = read(KEY);
    if (raw == null) { state = {}; return state; }
    try { const s = JSON.parse(raw); if (isObj(s)) state = s; } catch (e) { /* 手元を残す */ }
    return state;
  }

  function get(r, g, k) {
    const e = ((state[r] || {})[g] || {})[k];
    if (!e) return { stages: {} };
    const out = Object.assign({}, e, { stages: Object.assign({}, e.stages) });
    if (isObj(e.clips)) out.clips = Object.assign({}, e.clips);
    return out;
  }
  function put(r, g, k, e) {
    state[r] = state[r] || {};
    state[r][g] = state[r][g] || {};
    state[r][g][k] = e;
    save();
    return get(r, g, k);
  }
  function patch(r, g, k, obj) { return put(r, g, k, Object.assign(get(r, g, k), obj)); }
  function revealStage(r, g, k, n) { const e = get(r, g, k); e.stages[n] = true; return put(r, g, k, e); }
  // 段階 n とそれより後の段階をすべて取り消す（段階ヒント画面）
  function undoStage(r, g, k, n) {
    const e = get(r, g, k);
    Object.keys(e.stages).forEach((m) => { if (Number(m) >= Number(n)) delete e.stages[m]; });
    return put(r, g, k, e);
  }
  // 段階 n だけを取り消す（音声の一覧型・逆転：順番が無い）
  function clearStage(r, g, k, n) { const e = get(r, g, k); delete e.stages[n]; return put(r, g, k, e); }
  // 逆転でクリップ n を流した：番号を覚え（再読み込み後も済の印が残る）、問題を「出題中」にする（played）
  function markClipPlayed(r, g, k, n) { const e = get(r, g, k); e.clips = Object.assign({}, e.clips, { [n]: true }); e.played = true; return put(r, g, k, e); }
  function setAnswer(r, g, k, on) { return patch(r, g, k, { answer: !!on }); }
  function resetQ(r, g, k) { if (state[r] && state[r][g]) { delete state[r][g][k]; save(); } }
  function resetRound(r) { delete state[r]; save(); }

  /* ---------- 判定 ---------- */
  const revealed = (st) => (st && isObj(st.stages) ? Object.keys(st.stages).filter((n) => st.stages[n]).map(Number).sort((a, b) => a - b) : []);
  const playedClips = (st) => (st && isObj(st.clips) ? Object.keys(st.clips).filter((n) => st.clips[n]).map(Number).sort((a, b) => a - b) : []);
  const isStarted = (st) => !!(st && (st.done || st.answer || st.played || revealed(st).length));
  // 段階ヒント・逆転：解答を出したか手動で済。対動画：回答動画を再生したか手動で済
  // eslint-disable-next-line no-unused-vars
  const isDone = (st, q) => !!(st && (st.done || st.answer));
  function entryOf(store, genre, q) { return ((((store || state)[genre.round] || {})[genre.id] || {})[q.key]) || null; }
  const countStarted = (genre, store) => (genre.questions || []).filter((q) => isStarted(entryOf(store, genre, q))).length;
  const countDone = (genre, store) => (genre.questions || []).filter((q) => isDone(entryOf(store, genre, q), q)).length;

  root.QuizProgress = {
    KEY, OLD_KEY,
    load, reload, save, onSaveFail, get, patch, revealStage, undoStage, clearStage, markClipPlayed, setAnswer, resetQ, resetRound, resolveV2Pairs,
    revealed, playedClips, isStarted, isDone, countStarted, countDone,
    state: () => state,
    migratedFromV2: () => migrated,
    _internal: { migrateV2, migrateKey, migrateEntry, mergeEntry, v2PairKeys },
  };
})(window);
