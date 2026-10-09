#!/usr/bin/env node
/* 出題データの自動チェック（Node 24、依存なし）
 *
 * サイトと同じ js/config.js・js/loader.js を読み込み、フォルダ構成を問題に組み立てて表とパターン集計を出す。
 *
 *   node scripts/check_media.mjs                         … <repo>/drive → <repo>/media の順にある方を、全部の回
 *   node scripts/check_media.mjs --base <フォルダ> --round 第1回
 *   node scripts/check_media.mjs --url http://127.0.0.1:8765 [--check-files]
 *                                                        … サーバーの一覧をサイトと同じコード（walk）で読む。
 *                                                          --check-files は割り当てた全 URL に Range: bytes=0-0 で GET（200/206 を期待）
 *   --offline-check   … Drive のクラウド占位（st.blocks===0 && st.size>0）を数える（ファイルは開かない）
 *   --expected <json> … ジャンルごとのパターン集計を JSON と比較（tests/expected.*.json は git 管理外）
 *   --json <path>     … 組み立てた結果を JSON で書き出す
 *   --quiet           … 問題ごとの表を出さない
 *
 * 終了コード 1：割り当てられないファイル（unassigned）がある、または --expected と食い違う。
 * 出力には実データのファイル名（＝答え）が含まれる。公開リポジトリや PR に貼らないこと。
 * このスクリプトは --json の出力先以外には何も書き込まない。媒体ファイルは開かない（--check-files の Range 取得を除く）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- 引数 ---------- */
function parseArgs(argv) {
  const a = { base: null, round: null, url: null, checkFiles: false, offlineCheck: false, expected: null, json: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = () => { const v = argv[++i]; if (v == null) { console.error(`${k} に値がありません`); process.exit(2); } return v; };
    if (k === '--base') a.base = val();
    else if (k === '--round') a.round = val();
    else if (k === '--url') a.url = val().replace(/\/+$/, '');
    else if (k === '--check-files') a.checkFiles = true;
    else if (k === '--offline-check') a.offlineCheck = true;
    else if (k === '--expected') a.expected = val();
    else if (k === '--json') a.json = val();
    else if (k === '--quiet') a.quiet = true;
    else if (k === '-h' || k === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); process.exit(0); }
    else { console.error(`知らない引数：${k}`); process.exit(2); }
  }
  return a;
}

/* ---------- ローダーの読み込み（ブラウザと同じファイルを new Function で実行） ---------- */
// python http.server の一覧 HTML から <a href> を取り出すだけの DOMParser（--url モード用）
class TinyDOMParser {
  parseFromString(html) {
    const hrefs = [];
    const re = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    let m;
    while ((m = re.exec(html))) hrefs.push((m[1] != null ? m[1] : m[2]).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    return { querySelectorAll: () => hrefs.map((h) => ({ getAttribute: () => h })) };
  }
}
export function loadQuizLoader({ fetchImpl, mediaBases } = {}) {
  const window = {};
  const run = (file) => new Function('window', 'fetch', 'DOMParser', fs.readFileSync(path.join(REPO, file), 'utf8'))(window, fetchImpl || (() => Promise.reject(new Error('fetch は使えません'))), TinyDOMParser);
  run('js/config.js');
  if (mediaBases) window.QUIZ_CONFIG.mediaBases = mediaBases;
  run('js/loader.js');
  return { L: window.QuizLoader, CFG: window.QUIZ_CONFIG };
}

/* ---------- ファイルシステムを walk() と同じ形でたどる ---------- */
// walk()：ファイルを先に、続けて各フォルダの「名前/」行とその中身。深さ 4（回/ジャンル/group/level/葉/ファイル）
export function fsWalk(absDir, rel, depth, hiddenDir) {
  let entries;
  try { entries = fs.readdirSync(absDir); } catch (e) { return null; }
  entries.sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
  const out = [], dirs = [];
  for (const name of entries) {
    let st; try { st = fs.statSync(path.join(absDir, name)); } catch (e) { continue; }
    const p = rel ? rel + '/' + name : name;
    if (st.isDirectory()) { if (!hiddenDir(name) && depth > 0) dirs.push([name, p]); }
    else if (!name.startsWith('.')) out.push(p);
  }
  for (const [name, p] of dirs) {
    out.push(p + '/');
    const sub = fsWalk(path.join(absDir, name), p, depth - 1, hiddenDir);
    if (sub) out.push(...sub);
  }
  return out;
}

/* ---------- 表とパターン集計 ---------- */
const answerKinds = (q) => ['image', 'audio', 'video'].filter((k) => q.answer[k]).join('+') || '-';
const noteFlag = (q) => q.notes.length ? 'note' : (q.answer.textSrc ? 'txt' : '-');
export function patternOf(q) {
  const st = q.mode === 'pair' ? `pair(${q.pair.question ? 'q' : '-'}${q.pair.answer ? '+a' : ''})` : `x${q.stages.length}`;
  return `${q.format || '-'} ${st} ans=${answerKinds(q)} note=${q.notes.length ? 'yes' : 'no'}`;
}
export function histogram(round) {
  const h = {};
  for (const g of round.genres) {
    const m = h[g.id] = {};
    for (const q of g.questions) { const k = patternOf(q); m[k] = (m[k] || 0) + 1; }
  }
  for (const w of round.warnings) if (w.type === 'empty') { const m = h[w.genre] = h[w.genre] || {}; m['(empty)'] = (m['(empty)'] || 0) + 1; }
  return h;
}
function sortedObj(o) { return Object.fromEntries(Object.keys(o).sort((a, b) => a.localeCompare(b, 'ja')).map((k) => [k, typeof o[k] === 'object' && o[k] ? sortedObj(o[k]) : o[k]])); }

function report(round, opts, out) {
  const p = (s = '') => out.push(s);
  p(`== ${round.name}  （読み込み元 ${round.base}、${round.source || 'fs'}、ファイル ${round.fileCount}）`);
  let total = 0;
  for (const g of round.genres) {
    total += g.questions.length;
    p('');
    p(`-- ${g.id}  [${g.category} / ${g.scoring}${g.scoringLabel ? '：' + g.scoringLabel : ''} / type=${g.type}]  ${g.questions.length} 問`);
    if (!opts.quiet) {
      p('   key | group | level | id | kind | scoring(source) | mode | format | stages | answer | note');
      for (const q of g.questions) {
        const lv = q.level ? `${q.level.label}(${q.level.points})` : '-';
        const st = q.mode === 'pair' ? `pair:${q.pair.question ? 'q' : '-'}${q.pair.answer ? '+a' : ''}` : `${q.stages.length}[${q.stages.map((s) => s.n).join(',')}] pts=${q.points.map((x) => x == null ? '-' : x).join('/')}`;
        p(`   ${q.key} | ${q.group || '-'} | ${lv} | ${q.id} | ${q.kind || '-'} | ${q.scoring}(${q.scoringSource}) | ${q.mode} | ${q.format || '-'} | ${st} | ${answerKinds(q)}${q.answer.text ? ' text="' + q.answer.text + '"' : ''} | ${noteFlag(q)}${q.warnings.length ? '  !' + q.warnings.map((w) => w.type).join(',') : ''}`);
      }
    }
  }
  p('');
  p(`警告 ${round.warnings.length} 件`);
  for (const w of round.warnings) p(`   [${w.type}] ${w.path} ─ ${w.message}`);
  const h = histogram(round);
  p('');
  p('パターン集計（名前を含まない）');
  for (const [gid, m] of Object.entries(sortedObj(h))) {
    p(`   ${gid}`);
    for (const [k, n] of Object.entries(m)) p(`      ${String(n).padStart(3)}  ${k}`);
  }
  const all = {};
  for (const m of Object.values(h)) for (const [k, n] of Object.entries(m)) all[k] = (all[k] || 0) + n;
  p('   （全ジャンル）');
  for (const [k, n] of Object.entries(sortedObj(all))) p(`      ${String(n).padStart(3)}  ${k}`);
  const qs = round.genres.flatMap((g) => g.questions);
  const noStage = qs.filter((q) => !q.stages.length && !(q.pair && q.pair.question)).length;
  const noAns = qs.filter((q) => !(q.answer.image || q.answer.audio || q.answer.video || q.answer.text || q.answer.textSrc)).length;
  const count = (t) => round.warnings.filter((w) => w.type === t).length;
  p('');
  p(`合計：問題 ${total}／空フォルダ ${count('empty')}／未割り当て ${count('unassigned')}／段階も問題動画も無い ${noStage}／答えもメモも無い ${noAns}`);
  return { total, unassigned: count('unassigned'), empty: count('empty'), noStage, noAns, hist: h };
}

function compareExpected(expected, actual, out) {
  const diffs = [];
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const g of keys) {
    const e = expected[g] || {}, a = actual[g] || {};
    for (const k of new Set([...Object.keys(e), ...Object.keys(a)])) if ((e[k] || 0) !== (a[k] || 0)) diffs.push(`   ${g} :: ${k}  期待 ${e[k] || 0} / 実際 ${a[k] || 0}`);
  }
  out.push('');
  out.push(diffs.length ? `--expected と食い違い ${diffs.length} 件` : '--expected と一致');
  out.push(...diffs);
  return diffs.length === 0;
}

/* ---------- --check-files：割り当てた URL を Range で 1 バイトだけ取得 ---------- */
function mediaUrls(round) {
  const urls = [];
  for (const g of round.genres) for (const q of g.questions) {
    q.stages.forEach((s) => urls.push(s.src));
    if (q.pair) { if (q.pair.question) urls.push(q.pair.question); if (q.pair.answer) urls.push(q.pair.answer); }
    ['image', 'audio', 'video', 'textSrc'].forEach((k) => { if (q.answer[k]) urls.push(q.answer[k]); });
    q.notes.forEach((n) => urls.push(n.src));
  }
  return [...new Set(urls)];
}
async function checkFiles(host, urls, out) {
  const fails = []; let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const u = urls[i++];
      try {
        const r = await fetch(new URL(u, host + '/').href, { headers: { Range: 'bytes=0-0' } });
        if (r.body) await r.body.cancel().catch(() => {});
        if (r.status !== 200 && r.status !== 206) fails.push(`${r.status} ${decodeURIComponent(u)}`);
      } catch (e) { fails.push(`ERR ${decodeURIComponent(u)} ─ ${e.message}`); }
    }
  };
  await Promise.all([1, 2, 3, 4].map(worker));
  out.push('');
  out.push(`--check-files：${urls.length} 件中 失敗 ${fails.length} 件`);
  fails.forEach((f) => out.push('   ' + f));
  return fails.length === 0;
}

/* ---------- --offline-check ---------- */
function offlineCheck(absRound, lines, out) {
  let files = 0, holders = 0, bytes = 0, holderBytes = 0;
  const byGenre = {};
  for (const l of lines) {
    if (l.endsWith('/')) continue;
    let st; try { st = fs.statSync(path.join(absRound, l)); } catch (e) { continue; }
    files++; bytes += st.size;
    if (st.blocks === 0 && st.size > 0) {
      holders++; holderBytes += st.size;
      const g = l.split('/')[0].normalize('NFC'); byGenre[g] = (byGenre[g] || 0) + 1;
    }
  }
  const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
  out.push('');
  out.push(`--offline-check：${files} ファイル（${mb(bytes)}）中、クラウド占位（未ダウンロード）${holders} 件（${mb(holderBytes)}）`);
  for (const [g, n] of Object.entries(byGenre)) out.push(`   ${g}: ${n}`);
  return holders;
}

/* ---------- main ---------- */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = [];
  const rounds = [];
  let ok = true;

  if (args.url) {
    const host = args.url;
    const fetchImpl = (u, opts) => fetch(new URL(u, host + '/').href, opts);
    const { L } = loadQuizLoader({ fetchImpl });
    const found = await L.discoverRounds();
    const info = L.baseInfo();
    out.push(`--url ${host}：読み込み元 ${info.base}（${info.tried.map((t) => `${t.base}=${t.ok ? 'OK' : 'NG'} ${t.reason}`).join('、')}）、回 ${found.rounds.join('・') || 'なし'}（${found.source}）`);
    const names = args.round ? found.rounds.filter((n) => n === args.round.normalize('NFC')) : found.rounds;
    if (!names.length) { out.push('対象の回がありません'); ok = false; }
    for (const n of names) {
      const r = await L.loadRound(n);
      if (r.error) { out.push(`${n}: ${r.error}`); ok = false; continue; }
      rounds.push(r);
    }
  } else {
    const bases = args.base ? [path.resolve(args.base)] : [path.join(REPO, 'drive'), path.join(REPO, 'media')];
    const { L } = loadQuizLoader();
    const { hiddenDir } = L._internal;
    let baseAbs = null, roundDirs = [];
    for (const b of bases) {
      let names; try { names = fs.readdirSync(b); } catch (e) { continue; }
      const dirs = names.filter((n) => !hiddenDir(n) && fs.statSync(path.join(b, n)).isDirectory());
      if (dirs.length) { baseAbs = b; roundDirs = dirs; break; }
    }
    if (!baseAbs) { console.error(`回のフォルダが見つかりません：${bases.join('、')}`); process.exit(2); }
    if (args.round) roundDirs = roundDirs.filter((n) => n.normalize('NFC') === args.round.normalize('NFC'));
    if (!roundDirs.length) { console.error(`回 ${args.round} がありません：${baseAbs}`); process.exit(2); }
    roundDirs.sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
    const label = path.relative(REPO, baseAbs).startsWith('..') ? path.basename(baseAbs) : path.relative(REPO, baseAbs) || '.';
    for (const rd of roundDirs) {
      const abs = path.join(baseAbs, rd);
      const lines = fsWalk(abs, '', 4, hiddenDir) || [];
      const r = L.parse(rd, lines, { base: label });
      r.source = 'fs';
      rounds.push(r);
      if (args.offlineCheck) r._offlineAbs = [abs, lines];
    }
  }

  const hists = {};
  for (const r of rounds) {
    const s = report(r, args, out);
    hists[r.name] = s.hist;
    if (s.unassigned) ok = false;
    if (r._offlineAbs) { offlineCheck(r._offlineAbs[0], r._offlineAbs[1], out); delete r._offlineAbs; }
    out.push('');
  }
  if (args.checkFiles) {
    if (!args.url) out.push('--check-files は --url と一緒に使います');
    else for (const r of rounds) if (!(await checkFiles(args.url, mediaUrls(r), out))) ok = false;
  }
  if (args.expected) {
    const exp = JSON.parse(fs.readFileSync(args.expected, 'utf8'));
    // 回が 1 つなら { ジャンル: {...} }、複数なら { 回: { ジャンル: {...} } } のどちらでも可
    const actual = rounds.length === 1 && !exp[rounds[0].name] ? hists[rounds[0].name] : hists;
    if (!compareExpected(exp, actual, out)) ok = false;
  }
  if (args.json) {
    const target = path.resolve(args.json);
    fs.writeFileSync(target, JSON.stringify(rounds.length === 1 ? rounds[0] : rounds, null, 2));
    out.push(`JSON → ${target}`);
  }
  out.push(ok ? '結果：OK' : '結果：NG');
  console.log(out.join('\n'));
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
