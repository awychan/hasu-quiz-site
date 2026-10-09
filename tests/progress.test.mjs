// 進捗ストア（js/progress.js）のテスト（node --test）。名前はすべてダミー
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(REPO, 'js/progress.js'), 'utf8');

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
function loadProgress() { const window = {}; new Function('window', SRC)(window); return window.QuizProgress; }

const V2 = {
  第1回: {
    '楽曲・音声_テスト_減点方式': {
      q1: { clips: { 3: true, 1: true } },
      q2: { clips: { 2: true }, done: true },
    },
    '楽曲・歌詞_テスト_減点方式': { q1: { lyrics: { 3: true, 2: true } }, q2: { lyrics: { 3: true }, answer: true } },
    '文章_テスト_減点方式': { q1: { hint: 0 }, q2: { hint: 2 }, q3: { hint: 3 }, q4: { answer: true } },
    '動画_テスト_点数方式': { 'L1-1': { played: true }, 'L2-3': { played: true, answer: true }, 'L3-2': { done: true } },
  },
};

test('v2 → v3：キー・段階・解答・済を移行し、v2 は残す', () => {
  const P = loadProgress();
  const st = memStorage({ 'hasu-quiz-progress-v2': JSON.stringify(V2) });
  P.load(st);
  assert.equal(P.migratedFromV2(), true);
  assert.ok(st.getItem('hasu-quiz-progress-v3'), 'v3 を書き込む');
  assert.equal(st.getItem('hasu-quiz-progress-v2'), JSON.stringify(V2), 'v2 はそのまま');
  const g = (gid, k) => P.get('第1回', gid, k);
  // clips 3点 → ①、1点 → ③
  assert.deepEqual(g('楽曲・音声_テスト_減点方式', '1').stages, { 1: true, 3: true });
  assert.deepEqual(g('楽曲・音声_テスト_減点方式', '2'), { stages: { 2: true }, done: true });
  // lyrics 3点・2点 → ①②、answer → ①〜③ も
  assert.deepEqual(g('楽曲・歌詞_テスト_減点方式', '1').stages, { 1: true, 2: true });
  assert.deepEqual(g('楽曲・歌詞_テスト_減点方式', '2'), { stages: { 1: true, 2: true, 3: true }, answer: true });
  // hint 0 → ①、hint 2 → ①〜③、hint 3 → answer
  assert.deepEqual(g('文章_テスト_減点方式', '1').stages, { 1: true });
  assert.deepEqual(g('文章_テスト_減点方式', '2').stages, { 1: true, 2: true, 3: true });
  assert.equal(g('文章_テスト_減点方式', '2').answer, undefined);
  assert.equal(g('文章_テスト_減点方式', '3').answer, true);
  assert.equal(g('文章_テスト_減点方式', '4').answer, true);
  assert.deepEqual(g('文章_テスト_減点方式', '4').stages, { 1: true, 2: true, 3: true });
  // L<点>-<id> は回を読み込むまで保留（resolveV2Pairs で v3 のキーへ）
  assert.deepEqual(g('動画_テスト_点数方式', '~v2~L1-1'), { stages: {}, played: true });
  assert.deepEqual(g('動画_テスト_点数方式', '初級~1'), { stages: {} });
  assert.equal(g('文章_テスト_減点方式', 'q1').stages[1], undefined, '旧キーは残らない');
});

// 対動画のジャンル（ダミー）：級フォルダ直下に <幹>_動画_問題 / <幹>_動画_正解。幹に数字が無いので v2 は一覧の順（小文字・符号位置順）、v3 は自然順
const src = (lv, f) => `drive/第1回/${encodeURIComponent('動画_テスト_点数方式')}/${encodeURIComponent(lv)}/${encodeURIComponent(f)}`;
const pairQ = (lv, rank, id, stem) => ({ key: `${lv}~${id}`, id, mode: 'pair', group: null, level: { label: lv, rank }, pair: { question: src(lv, `${stem}_動画_問題.mp4`), answer: src(lv, `${stem}_動画_正解.mp4`) } });
const PAIR_GENRE = {
  round: '第1回', id: '動画_テスト_点数方式',
  questions: [
    // v3 の自然順では いちご=1, Banana=2, apple=3 とする（v2 の順は apple=1, Banana=2, いちご=3）
    pairQ('初級', 3, 1, 'いちご'), pairQ('初級', 3, 2, 'Banana'), pairQ('初級', 3, 3, 'apple'),
    pairQ('中級', 2, 1, 'ダミーB'), pairQ('中級', 2, 2, 'ダミーA'), pairQ('中級', 2, 3, 'ダミーC'),
    pairQ('上級', 1, 1, 'x'), pairQ('上級', 1, 2, 'y'),
  ],
};

test('対動画の旧キー：v2 の番号の振り方で v3 の問題へ移す', () => {
  const P = loadProgress();
  const st = memStorage({ 'hasu-quiz-progress-v2': JSON.stringify(V2) });
  P.load(st);
  const res = P.resolveV2Pairs(PAIR_GENRE);
  assert.deepEqual(res, { moved: 3, dropped: 0 });
  const g = (k) => P.get('第1回', '動画_テスト_点数方式', k);
  // L1-1 = 初級の 1 番目（v2：apple）→ v3 の 初級~3
  assert.deepEqual(g('初級~3'), { stages: {}, played: true });
  assert.deepEqual(g('初級~1'), { stages: {} });
  // L2-3 = 中級の 3 番目（v2：ダミーC）→ 中級~3
  assert.deepEqual(g('中級~3'), { stages: {}, played: true, answer: true });
  // L3-2 = 上級の 2 番目（v2：y）→ 上級~2
  assert.deepEqual(g('上級~2'), { stages: {}, done: true });
  assert.ok(!Object.keys(P.state()['第1回']['動画_テスト_点数方式']).some((k) => k.startsWith('~v2~')), '保留キーは消える');
  assert.ok(!st.getItem('hasu-quiz-progress-v3').includes('~v2~'), '保存にも残らない');
  assert.equal(P.countStarted(PAIR_GENRE), 3);
  // 2 回目は何もしない
  assert.deepEqual(P.resolveV2Pairs(PAIR_GENRE), { moved: 0, dropped: 0 });
});

test('対動画の旧キー：対応する問題が無ければ捨てて数える', () => {
  const P = loadProgress();
  P.load(memStorage({ 'hasu-quiz-progress-v2': JSON.stringify({ 第1回: { '動画_テスト_点数方式': { 'L1-9': { played: true }, 'L3-1': { done: true } } } }) }));
  assert.deepEqual(P.resolveV2Pairs(PAIR_GENRE), { moved: 1, dropped: 1 });
  assert.deepEqual(P.get('第1回', '動画_テスト_点数方式', '上級~1'), { stages: {}, done: true });
  assert.deepEqual(Object.keys(P.state()['第1回']['動画_テスト_点数方式']), ['上級~1']);
});

test('v2 → v3：NFD のジャンル名・回名・キーは NFC にして、重なる記録は合わせる', () => {
  const P = loadProgress();
  const gNfc = '楽曲・音声_ダミーボーカル_減点方式';
  const gNfd = gNfc.normalize('NFD');
  const rNfc = '第2回_ボーナス', rNfd = rNfc.normalize('NFD');
  assert.notEqual(gNfd, gNfc, 'テストの前提：NFD で別の文字列になる名前');
  assert.notEqual(rNfd, rNfc);
  const v2 = {
    第1回: { [gNfd]: { q1: { clips: { 3: true } }, q2: { done: true } }, [gNfc]: { q1: { clips: { 1: true } } } },
    [rNfd]: { [gNfd]: { q1: { played: true } } },
  };
  P.load(memStorage({ 'hasu-quiz-progress-v2': JSON.stringify(v2) }));
  assert.deepEqual(Object.keys(P.state()).sort(), ['第1回', rNfc].sort());
  assert.deepEqual(P.get(rNfc, gNfc, '1'), { stages: {}, played: true });
  assert.deepEqual(Object.keys(P.state()['第1回']), [gNfc]);
  assert.deepEqual(P.get('第1回', gNfc, '1').stages, { 1: true, 3: true });
  const genre = { round: '第1回', id: gNfc, questions: [{ key: '1', mode: 'staged' }, { key: '2', mode: 'staged' }] };
  assert.equal(P.countStarted(genre), 2);
});

test('v3 があれば v2 は読まない（移行は 1 回だけ）', () => {
  const P = loadProgress();
  const v3 = { 第1回: { g: { 1: { stages: { 1: true } } } } };
  const st = memStorage({ 'hasu-quiz-progress-v2': JSON.stringify(V2), 'hasu-quiz-progress-v3': JSON.stringify(v3) });
  P.load(st);
  assert.equal(P.migratedFromV2(), false);
  assert.deepEqual(P.state(), v3);
});

test('v2 も v3 も無い：空で始める', () => {
  const P = loadProgress();
  const st = memStorage();
  P.load(st);
  assert.deepEqual(P.state(), {});
  assert.equal(st.getItem('hasu-quiz-progress-v3'), null);
});

test('壊れた JSON：空で始める', () => {
  const P = loadProgress();
  P.load(memStorage({ 'hasu-quiz-progress-v3': '{oops' }));
  assert.deepEqual(P.state(), {});
});

test('revealStage／undoStage：n とそれより後を取り消す', () => {
  const P = loadProgress();
  const st = memStorage();
  P.load(st);
  [1, 2, 3, 4].forEach((n) => P.revealStage('R', 'G', 'k', n));
  assert.deepEqual(P.revealed(P.get('R', 'G', 'k')), [1, 2, 3, 4]);
  P.undoStage('R', 'G', 'k', 3);
  assert.deepEqual(P.revealed(P.get('R', 'G', 'k')), [1, 2]);
  P.undoStage('R', 'G', 'k', 1);
  assert.deepEqual(P.revealed(P.get('R', 'G', 'k')), []);
  assert.equal(P.isStarted(P.get('R', 'G', 'k')), false);
  // 保存されている
  assert.deepEqual(JSON.parse(st.getItem('hasu-quiz-progress-v3')).R.G.k.stages, {});
});

test('clearStage は 1 つだけ、setAnswer・resetQ・resetRound', () => {
  const P = loadProgress();
  P.load(memStorage());
  [1, 2, 3].forEach((n) => P.revealStage('R', 'G', 'k', n));
  P.clearStage('R', 'G', 'k', 2);
  assert.deepEqual(P.revealed(P.get('R', 'G', 'k')), [1, 3]);
  P.setAnswer('R', 'G', 'k', true);
  assert.equal(P.isDone(P.get('R', 'G', 'k'), { mode: 'staged' }), true);
  P.setAnswer('R', 'G', 'k', false);
  assert.equal(P.isDone(P.get('R', 'G', 'k'), { mode: 'staged' }), false);
  P.resetQ('R', 'G', 'k');
  assert.deepEqual(P.get('R', 'G', 'k'), { stages: {} });
  P.patch('R', 'G', 'x', { played: true });
  P.resetRound('R');
  assert.deepEqual(P.state(), {});
});

test('get はコピーを返す（書き換えても保存値は変わらない）', () => {
  const P = loadProgress();
  P.load(memStorage());
  P.revealStage('R', 'G', 'k', 1);
  const e = P.get('R', 'G', 'k'); e.stages[2] = true;
  assert.deepEqual(P.revealed(P.get('R', 'G', 'k')), [1]);
});

test('isStarted／isDone／countStarted', () => {
  const P = loadProgress();
  P.load(memStorage());
  const genre = { round: 'R', id: 'G', questions: [{ key: '1', mode: 'staged' }, { key: '2', mode: 'pair' }, { key: '3', mode: 'clips' }] };
  assert.equal(P.countStarted(genre), 0);
  P.patch('R', 'G', '2', { played: true });
  assert.equal(P.isStarted(P.get('R', 'G', '2')), true);
  assert.equal(P.isDone(P.get('R', 'G', '2'), genre.questions[1]), false, '問題動画の再生だけでは済にならない');
  P.patch('R', 'G', '2', { answer: true });
  assert.equal(P.isDone(P.get('R', 'G', '2'), genre.questions[1]), true);
  P.revealStage('R', 'G', '3', 5);
  assert.equal(P.countStarted(genre), 2);
  assert.equal(P.countStarted(genre, {}), 0, 'store を渡せばそれを数える');
  assert.equal(P.countDone(genre), 1);
});

test('markClipPlayed：流したクリップの番号が保存され、再読み込みしても残る', () => {
  const P = loadProgress();
  const st = memStorage();
  P.load(st);
  assert.deepEqual(P.playedClips(P.get('R', 'G', 'c')), []);
  P.markClipPlayed('R', 'G', 'c', 3);
  P.markClipPlayed('R', 'G', 'c', 12);
  P.markClipPlayed('R', 'G', 'c', 3);   // 同じ番号をもう一度流しても 1 つ
  const e = P.get('R', 'G', 'c');
  assert.deepEqual(P.playedClips(e), [3, 12]);
  assert.equal(e.played, true, '出題中の判定は従来どおり played');
  assert.deepEqual(JSON.parse(st.getItem('hasu-quiz-progress-v3')).R.G.c.clips, { 3: true, 12: true });
  // 別の読み込み（再読み込み相当）
  const P2 = loadProgress();
  P2.load(st);
  assert.deepEqual(P2.playedClips(P2.get('R', 'G', 'c')), [3, 12]);
  const genre = { round: 'R', id: 'G', questions: [{ key: 'c', mode: 'clips' }] };
  assert.equal(P2.countStarted(genre), 1, '1 つでも流せば出題済の数に入る');
  assert.equal(P2.isDone(P2.get('R', 'G', 'c'), genre.questions[0]), false, '答えを開くまでは「済」ではない');
});

test('clips の記録は答えの開閉・全部隠す・取り消しで消えず、resetQ で消える', () => {
  const P = loadProgress();
  P.load(memStorage());
  P.markClipPlayed('R', 'G', 'c', 2);
  P.revealStage('R', 'G', 'c', 2);
  P.clearStage('R', 'G', 'c', 2);
  P.undoStage('R', 'G', 'c', 1);
  P.patch('R', 'G', 'c', { stages: {} });   // すべての答えを隠す
  P.setAnswer('R', 'G', 'c', true);
  assert.deepEqual(P.playedClips(P.get('R', 'G', 'c')), [2]);
  P.resetQ('R', 'G', 'c');
  assert.deepEqual(P.playedClips(P.get('R', 'G', 'c')), []);
  assert.deepEqual(P.get('R', 'G', 'c'), { stages: {} });
});

test('get は clips もコピーで返す／流したことが無ければ clips は付かない', () => {
  const P = loadProgress();
  P.load(memStorage());
  P.revealStage('R', 'G', 'k', 1);
  assert.equal('clips' in P.get('R', 'G', 'k'), false);
  P.markClipPlayed('R', 'G', 'k', 1);
  const e = P.get('R', 'G', 'k'); e.clips[9] = true;
  assert.deepEqual(P.playedClips(P.get('R', 'G', 'k')), [1]);
  // 同じ問題の 2 つの記録を合わせるときも clips は和
  const m = P._internal.mergeEntry({ stages: {}, clips: { 1: true } }, { stages: {}, clips: { 4: true }, played: true });
  assert.deepEqual(m, { stages: {}, clips: { 1: true, 4: true }, played: true });
});

test('reload：ほかのタブが書いた内容を読み直す（キーが消えたら空、壊れた JSON は手元を残す）', () => {
  const P = loadProgress();
  const st = memStorage();
  P.load(st);
  P.revealStage('R', 'G', 'a', 1);
  // 別のタブが書いた（a は無く、b がある）
  st.setItem('hasu-quiz-progress-v3', JSON.stringify({ R: { G: { b: { stages: { 2: true } } } } }));
  P.reload();
  assert.deepEqual(P.get('R', 'G', 'a'), { stages: {} });
  assert.deepEqual(P.get('R', 'G', 'b').stages, { 2: true });
  st.setItem('hasu-quiz-progress-v3', '{壊れた');
  P.reload();
  assert.deepEqual(P.get('R', 'G', 'b').stages, { 2: true }, '壊れた JSON では手元を残す');
  st.removeItem('hasu-quiz-progress-v3');
  P.reload();
  assert.deepEqual(P.state(), {});
});

test('save：書けないときは false を返し、onSaveFail に知らせる', () => {
  const P = loadProgress();
  const st = memStorage();
  P.load(st);
  let calls = 0;
  P.onSaveFail(() => { calls++; });
  assert.equal(P.save(), true);
  st.setItem = () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
  assert.equal(P.save(), false);
  P.revealStage('R', 'G', 'k', 1);   // 手元には残る
  assert.deepEqual(P.get('R', 'G', 'k').stages, { 1: true });
  assert.equal(calls, 2);
});
