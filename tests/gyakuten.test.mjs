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
