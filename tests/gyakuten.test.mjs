// 逆転ジャンル・お題.txt・ルール.txt のテスト（node --test）。名前はすべてダミー
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadQuizLoader } from '../scripts/check_media.mjs';

const { L } = loadQuizLoader();
const parse = (lines) => L.parse('第1回', lines, { base: 'media' });
const only = (r) => { assert.equal(r.genres.length, 1, 'ジャンルは 1 つ'); return r.genres[0]; };
const q1 = (r) => { const g = only(r); assert.equal(g.questions.length, 1, '問題は 1 つ'); return g.questions[0]; };
const circled = (n) => String.fromCharCode(n <= 20 ? 0x2460 + n - 1 : 0x3251 + n - 21);
const staged = (dir, stem, n, ext = 'png') => Array.from({ length: n }, (_, i) => `${dir}/${stem}_${circled(i + 1)}.${ext}`);

const gyaku = (name = '逆転_テスト_減点方式') => [
  `${name}/第1問/画像_①.png`, `${name}/第1問/画像_解答.png`,
  `${name}/第2問/画像_①.png`, `${name}/第2問/画像_解答.png`,
  ...staged(`${name}/第3問`, 'クリップ', 20, 'mp3'),
];

test('逆転ジャンル：全問が gyakuten、減点方式のまま、mode は問題ごと', () => {
  const g = only(parse(gyaku()));
  assert.equal(g.gyakuten, true); assert.equal(g.category, '逆転'); assert.equal(g.scoring, 'deduct');
  assert.ok(g.questions.every((q) => q.gyakuten === true && q.scoring === 'deduct'));
  assert.deepEqual(g.questions.map((q) => q.mode), ['staged', 'staged', 'clips']);
});

test('逆転ジャンル：方式が無くても減点方式（全角記号の名前も可）', () => {
  const g = only(parse(gyaku('逆転_テスト！')));
  assert.equal(g.gyakuten, true); assert.equal(g.scoring, 'deduct');
  assert.ok(g.questions.every((q) => q.scoring === 'deduct'));
});

test('逆転でないジャンルは gyakuten が false', () => {
  const g = only(parse(gyaku('文章_テスト_減点方式')));
  assert.equal(g.gyakuten, false);
  assert.ok(g.questions.every((q) => !q.gyakuten));
});

test('逆転ジャンルは番号があっても TOP の最後', () => {
  const r = parse([...gyaku('逆転_テスト_減点方式'), '01_文章_甲_減点方式/第1問/画像_①.png', '01_文章_甲_減点方式/第1問/画像_解答.png', '動画_乙_点数方式/問題_動画.mp4', '動画_乙_点数方式/正解_動画.mp4']);
  assert.equal(r.genres[r.genres.length - 1].gyakuten, true);
  const r2 = parse([...gyaku('1_逆転_テスト_減点方式'), '文章_甲_減点方式/第1問/画像_①.png', '文章_甲_減点方式/第1問/画像_解答.png']);
  assert.equal(r2.genres[r2.genres.length - 1].category, '逆転');
});

test('お題.txt：odaiSrc に入り、メモにも未割り当てにも数えない', () => {
  const g = only(parse([...gyaku(), '逆転_テスト_減点方式/第3問/お題.txt']));
  const q = g.questions.find((x) => x.mode === 'clips');
  assert.ok(q.odaiSrc.endsWith(encodeURIComponent('お題.txt')));
  assert.equal(q.answer.text, null); assert.equal(q.answer.textSrc, null);
  assert.deepEqual(g.questions.filter((x) => x !== q).map((x) => x.odaiSrc), [null, null]);
  assert.ok(!g.warnings.some((w) => w.type === 'unassigned'));
});

test('お題.txt と答えのメモ（_<名前>.txt）は別物', () => {
  const q = q1(parse(['文章_テスト_減点方式/第1問/画像_①.png', '文章_テスト_減点方式/第1問/お題.txt', '文章_テスト_減点方式/第1問/_ダミー曲名.txt']));
  assert.equal(q.answer.text, 'ダミー曲名'); assert.ok(q.odaiSrc);
});

test('お題.txt：媒体の無いフォルダにだけあっても警告にしない', () => {
  const r = parse(['文章_テスト_減点方式/第1問/画像_①.png', '文章_テスト_減点方式/第2問/お題.txt']);
  assert.ok(!r.warnings.some((w) => w.type === 'unassigned'));
});

test('ルール.txt：rulesSrc に入り、問題にも警告にもならない', () => {
  const g = only(parse(['文章_テスト_減点方式/ルール.txt', '文章_テスト_減点方式/第1問/画像_①.png', '文章_テスト_減点方式/第1問/画像_解答.png']));
  assert.ok(g.rulesSrc.endsWith(encodeURIComponent('ルール.txt')));
  assert.equal(g.questions.length, 1); assert.equal(g.warnings.length, 0);
  assert.equal(g.questions[0].answer.textSrc, null);
});

test('ルール.txt が無ければ rulesSrc は null', () => {
  assert.equal(only(parse(['文章_テスト/第1問/画像_①.png'])).rulesSrc, null);
});

test('一覧ファイル（読み込み用ファイル.txt）経由でも お題.txt・ルール.txt を受け付ける', async () => {
  const body = ['# list', '第1回/逆転_テスト_減点方式/ルール.txt', ...staged('第1回/逆転_テスト_減点方式/第3問', 'クリップ', 4, 'mp3').map((l) => l), '第1回/逆転_テスト_減点方式/第3問/お題.txt'].join('\r\n');
  const fetchImpl = async (url) => (decodeURIComponent(String(url)).endsWith('読み込み用ファイル.txt') ? { ok: true, text: async () => body, headers: { get: () => 'text/plain' } } : { ok: false });
  const { L: L2 } = loadQuizLoader({ fetchImpl, mediaBases: ['media'] });
  const r = await L2.loadRound('第1回');
  const g = only(r);
  assert.ok(g.rulesSrc); assert.ok(g.questions[0].odaiSrc);
  assert.ok(!r.warnings.some((w) => w.type === 'unassigned'));
});

/* ---- 逆転ジャンルの逆転：メモの ①〜⑳ の行はクリップごとの組み合わせ（js/app.js の isGyakutenClips が見る q.mode / q.gyakuten / answer.textSrc） ---- */
test('逆転ジャンルの 20 クリップ＋メモ：mode は clips・gyakuten・メモの場所が answer.textSrc に入る', () => {
  const g = only(parse([...staged('逆転_テスト_減点方式/第3問', 'クリップ', 20, 'mp3'), '逆転_テスト_減点方式/第3問/_ダミー題名.txt']));
  const q = g.questions[0];
  assert.equal(q.mode, 'clips'); assert.equal(q.gyakuten, true);
  assert.ok(q.answer.textSrc.endsWith(encodeURIComponent('_ダミー題名.txt')));
  assert.equal(q.stages.length, 20);
});

test('逆転ジャンル以外の 20 クリップ＋メモは clips のまま gyakuten が false（従来の「答え」の開閉の画面）', () => {
  const q = q1(parse([...staged('文章_テスト_減点方式/第3問', 'クリップ', 20, 'mp3'), '文章_テスト_減点方式/第3問/_ダミー題名.txt']));
  assert.equal(q.mode, 'clips'); assert.equal(q.gyakuten, false);
});

test('noteLines：行頭の丸数字ごとに本文を拾う（直後の区切り・CRLF・空行・番号の無い行を扱う）', () => {
  const memo = 'ダミー題名・ダミーA\r\n\r\n①ダミーA・ダミーB・ダミーC\r\n② ダミーD　・ダミーE\r\n③：ダミーF\r\n④、ダミーG\r\n⑳ダミーH\r\n㉑ダミーI\r\nダミー⑤ダミーJ\r\n番号の無い行・ダミー';
  assert.deepEqual(L.noteLines(memo), { 1: 'ダミーA・ダミーB・ダミーC', 2: 'ダミーD　・ダミーE', 3: 'ダミーF', 4: 'ダミーG', 20: 'ダミーH', 21: 'ダミーI' });
});

test('noteLines：LF だけ・前後の空白・空の本文・同じ番号は後の行・空／null は空', () => {
  assert.deepEqual(L.noteLines('  ①ダミーA  \n②\n①ダミーB'), { 1: 'ダミーB', 2: '' });
  assert.deepEqual(L.noteLines(''), {});
  assert.deepEqual(L.noteLines(null), {});
  assert.deepEqual(L.noteLines(undefined), {});
});

test('comboItems：「・」で区切った項目にする（前後の空白は全角も落とし、空の項目は捨てる）', () => {
  assert.deepEqual(L.comboItems('ダミーA・ダミーB・ダミーC'), ['ダミーA', 'ダミーB', 'ダミーC']);
  assert.deepEqual(L.comboItems(' ダミーA ・　ダミーB　・'), ['ダミーA', 'ダミーB']);
  assert.deepEqual(L.comboItems('・ダミーA・・ダミーB・'), ['ダミーA', 'ダミーB']);
  assert.deepEqual(L.comboItems('ダミーA'), ['ダミーA']);
  assert.deepEqual(L.comboItems(''), []);
  assert.deepEqual(L.comboItems('・・'), []);
  assert.deepEqual(L.comboItems(null), []);
});

test('comboItems：順番と重複はそのまま、「・」以外（、 / スペース）では分けない', () => {
  assert.deepEqual(L.comboItems('ダミーB・ダミーA・ダミーB'), ['ダミーB', 'ダミーA', 'ダミーB']);
  assert.deepEqual(L.comboItems('ダミーA、ダミーB/ダミーC ダミーD'), ['ダミーA、ダミーB/ダミーC ダミーD']);
});

test('メモの 1 行 → 組み合わせ：noteLines と comboItems をつなぐ（番号の無い先頭行は使わない）', () => {
  const memo = ['ダミーA・ダミーB・ダミーC・ダミーD', '', '①ダミーA・ダミーB・ダミーC', '②ダミーB・ダミーD・ダミーA'].join('\r\n');
  const lines = L.noteLines(memo);
  assert.deepEqual(L.comboItems(lines[1]), ['ダミーA', 'ダミーB', 'ダミーC']);
  assert.deepEqual(L.comboItems(lines[2]), ['ダミーB', 'ダミーD', 'ダミーA']);
  assert.equal(lines[3], undefined, 'メモに無い番号は undefined（画面は「行がありません」と出す）');
});
