// ローダー v3 のテスト（node --test tests/）。名前はすべてダミー
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadQuizLoader } from '../scripts/check_media.mjs';

const { L } = loadQuizLoader();
const parse = (lines) => L.parse('第1回', lines, { base: 'media' });
const only = (r) => { assert.equal(r.genres.length, 1, 'ジャンルは 1 つ'); return r.genres[0]; };
const q1 = (r) => { const g = only(r); assert.equal(g.questions.length, 1, '問題は 1 つ'); return g.questions[0]; };
const types = (r) => r.warnings.map((w) => w.type);
const circled = (n) => String.fromCharCode(n <= 20 ? 0x2460 + n - 1 : 0x3251 + n - 21);
const staged = (dir, stem, n, ext = 'png') => Array.from({ length: n }, (_, i) => `${dir}/${stem}_${circled(i + 1)}.${ext}`);

test('第1問：番号・ラベル・キー、ジャンルの方式', () => {
  const q = q1(parse([...staged('文章_テスト_減点方式/第1問', '01画像', 3), '文章_テスト_減点方式/第1問/01画像_解答.png']));
  assert.equal(q.id, 1); assert.equal(q.key, '1'); assert.equal(q.label, '第1問');
  assert.equal(q.scoring, 'deduct'); assert.equal(q.scoringSource, 'genre');
  assert.equal(q.mode, 'staged'); assert.equal(q.format, 'image'); assert.equal(q.kind, '画像');
  assert.deepEqual(q.stages.map((s) => s.n), [1, 2, 3]);
  assert.deepEqual(q.points, [5, 2, 1]);
  assert.ok(q.answer.image.endsWith(encodeURIComponent('01画像_解答.png')));
  assert.equal(q.tierRank, null);
});

test('問題1：番号とラベル', () => {
  const q = q1(parse([...staged('文章_テスト_減点方式/問題1', '画像1', 1), '文章_テスト_減点方式/問題1/画像1_解答.png']));
  assert.equal(q.id, 1); assert.equal(q.key, '1'); assert.equal(q.label, '問題1');
});

test('問題1_減点方式：接尾辞が方式を決め、キーは変わらない', () => {
  const q = q1(parse([...staged('文章_テスト_点数方式/問題1_減点方式', '画像1', 3), '文章_テスト_点数方式/問題1_減点方式/画像1_解答.png']));
  assert.equal(q.key, '1'); assert.equal(q.scoring, 'deduct'); assert.equal(q.scoringSource, 'suffix');
  assert.deepEqual(q.points, [5, 2, 1]);
});

test('問題1_点数方式_3点：点数方式で各段階 3 点', () => {
  const q = q1(parse([...staged('文章_テスト/問題1_点数方式_3点', '画像1', 2), '文章_テスト/問題1_点数方式_3点/画像1_解答.png']));
  assert.equal(q.scoring, 'points'); assert.equal(q.scoringSource, 'suffix');
  assert.equal(q.pointsValue, 3); assert.deepEqual(q.points, [3, 3]);
});

test('問題1_逆転：clips モード', () => {
  const q = q1(parse([...staged('文章_テスト_減点方式/問題1_逆転', '音声', 3, 'mp3'), '文章_テスト_減点方式/問題1_逆転/_題名.txt']));
  assert.equal(q.mode, 'clips'); assert.equal(q.scoring, 'deduct'); assert.equal(q.scoringSource, 'suffix');
});

test('第１問（全角数字）は 第1問 と同じ', () => {
  const q = q1(parse([...staged('文章_テスト_減点方式/第１問', '画像', 1), '文章_テスト_減点方式/第１問/画像_解答.png']));
  assert.equal(q.id, 1); assert.equal(q.key, '1');
});

test('問題1_xxx方式（知らない接尾辞）：警告して減点扱い', () => {
  const r = parse([...staged('文章_テスト/問題1_xxx方式', '画像', 3), '文章_テスト/問題1_xxx方式/画像_解答.png']);
  const q = q1(r);
  assert.equal(q.scoring, 'deduct'); assert.equal(q.scoringSource, 'suffix'); assert.equal(q.id, 1);
  assert.ok(types(r).includes('unknown-suffix'));
});

test('カテゴリ無しのジャンル「リンクラ」＋ mp4 の対でも落ちない', () => {
  const r = parse(['リンクラ/動画1_問題.mp4', 'リンクラ/動画1_正解.mp4', 'リンクラ/問題2/動画2_問題.mp4', 'リンクラ/問題2/動画2_回答.mp4']);
  const g = only(r);
  assert.equal(g.questions.length, 2);
  assert.ok(g.questions.every((q) => q.mode === 'pair' && q.pair.question && q.pair.answer && q.format === 'video'));
  assert.deepEqual(g.questions.map((q) => q.key), ['1', '2']);
  assert.equal(g.type, 'video'); assert.equal(g.category, '動画');
});

test('1 つの 初級 フォルダに対が 2 組：問題 2 つ（id 1, 2）、級の点数', () => {
  const d = '動画_テスト_点数方式/初級';
  const g = only(parse([`${d}/動画1_問題.mp4`, `${d}/動画1_正解.mp4`, `${d}/動画2_問題.mp4`, `${d}/動画2_回答.mp4`]));
  assert.equal(g.questions.length, 2);
  assert.deepEqual(g.questions.map((q) => [q.id, q.key, q.label, q.mode]), [[1, '初級~1', '問題1', 'pair'], [2, '初級~2', '問題2', 'pair']]);
  const q = g.questions[0];
  assert.deepEqual(q.level, { label: '初級', rank: 3, points: 1 });
  assert.equal(q.scoring, 'points'); assert.equal(q.scoringSource, 'level'); assert.equal(q.pointsValue, 1); assert.equal(q.tierRank, 3);
  assert.equal(q.kind, null, '対動画の幹は画面に出さない');
  assert.ok(q.pair.answer.includes(encodeURIComponent('動画1_正解.mp4')));
  assert.equal(q.answer.video, q.pair.answer);
});

test('幹の末尾が数字でない対は自然順で 1, 2', () => {
  const d = '動画_テスト_点数方式/上級';
  const g = only(parse([`${d}/甲_動画_問題.mp4`, `${d}/甲_動画_正解.mp4`, `${d}/乙_動画_問題.mp4`, `${d}/乙_動画_正解.mp4`]));
  assert.deepEqual(g.questions.map((q) => q.id), [1, 2]);
  assert.equal(g.questions[0].level.points, 5, '上級 = 5点（tierPoints の 1 番目）');
  assert.equal(g.questions[0].tierRank, 1);
});

test('① ＋ 解答：1 段階、①=5点', () => {
  const q = q1(parse(['文章_テスト_減点方式/第1問/問い_①.png', '文章_テスト_減点方式/第1問/問い_解答.png']));
  assert.deepEqual(q.stages.map((s) => s.n), [1]); assert.deepEqual(q.points, [5]);
  assert.equal(q.mode, 'staged'); assert.ok(q.answer.image);
});

test('①〜⑳ ＋ メモ：clips、20 段階、メモの名前が答え', () => {
  const d = '文章_テスト_減点方式/第3問';
  const r = parse([...staged(d, '03音声', 20, 'mp3'), `${d}/_題名.txt`]);
  const q = q1(r);
  assert.equal(q.mode, 'clips'); assert.equal(q.stages.length, 20); assert.equal(q.format, 'audio');
  assert.deepEqual(q.points.slice(0, 4), [5, 2, 1, null]);
  assert.equal(q.answer.text, '題名'); assert.equal(q.notes.length, 1); assert.ok(q.answer.textSrc);
  assert.deepEqual(types(r), []);
});

test('④ は段階（答えではない）', () => {
  const d = '文章_テスト_減点方式/第1問';
  const q = q1(parse([...staged(d, '画像', 4), `${d}/画像_解答.png`]));
  assert.deepEqual(q.stages.map((s) => s.n), [1, 2, 3, 4]);
  assert.deepEqual(q.points, [5, 2, 1, null]);
  assert.equal(q.mode, 'staged', '解答ファイルがあるので clips ではない');
});

test('㉑ も段階として読む', () => {
  const d = '文章_テスト_減点方式/第1問';
  const q = q1(parse([...staged(d, '音声', 21, 'mp3'), `${d}/_題名.txt`]));
  assert.equal(q.stages.length, 21); assert.equal(q.stages[20].n, 21);
});

test('_ver1〜_ver3 も段階', () => {
  const d = '文章_テスト_減点方式/第2問';
  const q = q1(parse([`${d}/画像2_ver1.png`, `${d}/画像2_ver2.png`, `${d}/画像2_ver3.png`, `${d}/画像2_回答.png`]));
  assert.deepEqual(q.stages.map((s) => s.n), [1, 2, 3]); assert.equal(q.kind, '画像2'); assert.ok(q.answer.image);
});

test('メモは幹に数えず、問題に付く（_ の有無を問わない）', () => {
  const d = '楽曲・音声_テスト_減点方式';
  const r = parse([...staged(`${d}/第1問`, '01音声', 3, 'mp3'), `${d}/第1問/_曲名.txt`, ...staged(`${d}/第2問`, '02音声', 3, 'mp3'), `${d}/第2問/別の曲名.txt`]);
  const g = only(r);
  assert.equal(g.questions.length, 2);
  assert.equal(g.questions[0].answer.text, '曲名'); assert.equal(g.questions[1].answer.text, '別の曲名');
  assert.equal(g.questions[0].mode, 'staged');
  assert.deepEqual(types(r), []);
});

test('NFC と NFD で genre.id・key・id が同じ', () => {
  const lines = [...staged('文章_ガイド_減点方式/グループ/第1問', 'ゲーム', 3), '文章_ガイド_減点方式/グループ/第1問/ゲーム_解答.png'];
  const a = parse(lines), b = parse(lines.map((l) => l.normalize('NFD')));
  const qa = q1(a), qb = q1(b);
  assert.equal(only(b).id, only(a).id); assert.equal(only(b).id, '文章_ガイド_減点方式');
  assert.equal(qb.key, qa.key); assert.equal(qa.key, 'グループ~1'); assert.equal(qb.id, qa.id);
  assert.equal(qb.kind, qa.kind);
  assert.notEqual(qb.stages[0].src, qa.stages[0].src, 'URL は元の名前のまま');
});

test('空フォルダ：empty 警告のみ、問題に数えない', () => {
  const d = '文章_テスト_減点方式';
  const r = parse([`${d}/`, `${d}/第1問/`, ...staged(`${d}/第1問`, '画像', 1), `${d}/第1問/画像_解答.png`, `${d}/第2問/`, `${d}/サブ/`, `${d}/サブ/初級/`, '文章_空_減点方式/']);
  const g = only(r);
  assert.equal(g.questions.length, 1);
  assert.deepEqual(r.warnings.filter((w) => w.type === 'empty').map((w) => w.path).sort(), [`${d}/サブ/初級`, `${d}/第2問`, '文章_空_減点方式'].sort());
});

test('ジャンル直下にファイルとサブフォルダが混在', () => {
  const d = '文章_テスト_減点方式';
  const g = only(parse([`${d}/問い_①.png`, `${d}/問い_解答.png`, `${d}/第2問/問い2_①.png`, `${d}/第2問/問い2_解答.png`]));
  assert.deepEqual(g.questions.map((q) => q.key), ['1', '2']);
});

test('サブジャンル／級／葉（サブ/初級/x_①.png）', () => {
  const d = '文章_テスト_減点方式/サブ/初級';
  const q = q1(parse([`${d}/x_①.png`, `${d}/x_解答.png`]));
  assert.equal(q.group, 'サブ'); assert.equal(q.level.label, '初級'); assert.equal(q.key, 'サブ~初級~1');
  assert.equal(q.scoring, 'points'); assert.equal(q.scoringSource, 'level'); assert.deepEqual(q.points, [1]);
});

test('並び：group → 初級→中級→上級 → 番号の自然順', () => {
  const d = '文章_テスト_減点方式';
  const lines = [];
  for (const lv of ['上級', '中級', '初級']) lines.push(`${d}/B/${lv}/x_①.png`, `${d}/B/${lv}/x_解答.png`);
  for (const n of [10, 2, 1]) lines.push(`${d}/A/第${n}問/x_①.png`, `${d}/A/第${n}問/x_解答.png`);
  lines.push(`${d}/第3問/x_①.png`, `${d}/第3問/x_解答.png`);
  const g = only(parse(lines));
  assert.deepEqual(g.questions.map((q) => q.key), ['3', 'A~1', 'A~2', 'A~10', 'B~初級~1', 'B~中級~1', 'B~上級~1']);
  assert.deepEqual(g.sections.map((s) => [s.group, s.level && s.level.label, s.keys.length]), [[null, null, 1], ['A', null, 3], ['B', '初級', 1], ['B', '中級', 1], ['B', '上級', 1]]);
});

test('歌詞の画像 ①②③ ＋ 解答.png ＋ 解答.mp3', () => {
  const d = '楽曲・歌詞_テスト_減点方式/第1問';
  const q = q1(parse([...staged(d, '01歌詞', 3), `${d}/01歌詞_解答.png`, `${d}/01歌詞_解答.mp3`]));
  assert.equal(q.format, 'image'); assert.ok(q.answer.image); assert.ok(q.answer.audio); assert.equal(q.answer.video, null);
});

test('音声の段階 ＋ 解答.mp4 → answer.video（staged のまま）', () => {
  const d = '文章_テスト_減点方式/第3問';
  const q = q1(parse([...staged(d, '03声', 3, 'mp3'), `${d}/03声_解答.mp4`, `${d}/_曲名 人名.txt`]));
  assert.equal(q.mode, 'staged'); assert.equal(q.format, 'audio'); assert.ok(q.answer.video); assert.equal(q.answer.text, '曲名 人名');
  assert.equal(q.pair, null);
});

test('無視するもの：. で始まるファイル、_ で始まるフォルダ、_ で始まる txt 以外のファイル、一覧ファイル', () => {
  const d = '文章_テスト_減点方式';
  const r = parse(['.DS_Store', '読み込み用ファイル.txt', `${d}/.DS_Store`, `${d}/_下書き/x_①.png`, `${d}/_下書き/`, `${d}/第1問/_x.png`, `${d}/第1問/x_①.png`, `${d}/第1問/x_解答.png`]);
  const q = q1(r);
  assert.equal(q.stages.length, 1); assert.deepEqual(types(r), []);
  assert.equal(r.fileCount, 2);
});

test('割り当てられないファイル・幹が複数＋メモ・段階の抜けは警告', () => {
  const d = '文章_テスト_減点方式';
  const r = parse([`${d}/第1問/x_①.png`, `${d}/第1問/x_③.png`, `${d}/第1問/x_解答.png`, `${d}/第1問/資料.pdf`,
    `${d}/初級/動画1_問題.mp4`, `${d}/初級/動画2_問題.mp4`, `${d}/初級/_メモ.txt`]);
  const t = types(r);
  assert.ok(t.includes('unassigned')); assert.ok(t.includes('stage-gap')); assert.ok(t.includes('multi-stem-note')); assert.ok(t.includes('no-answer'));
});

test('「問題」は末尾にあるときだけ問題側の印（問題1_①.png は段階）', () => {
  const c = L._internal.classify;
  assert.deepEqual(c('問題1_①.png'), { marker: 'stage', n: 1, stem: '問題1' });
  assert.deepEqual(c('動画1_問題.mp4'), { marker: 'question', n: null, stem: '動画1' });
  assert.deepEqual(c('画像_正解.PNG'), { marker: 'answer', n: null, stem: '画像' });
  assert.deepEqual(c('画像_ver12.png'), { marker: 'stage', n: 12, stem: '画像' });
  assert.deepEqual(c('画像1.png'), { marker: null, n: null, stem: '画像1' }, '末尾の数字は段階にしない');
});

test('同じ番号の問題フォルダはキーを分けて警告', () => {
  const d = '文章_テスト_減点方式';
  const r = parse([`${d}/第1問/x_①.png`, `${d}/第1問/x_解答.png`, `${d}/問題1_減点方式/y_①.png`, `${d}/問題1_減点方式/y_解答.png`]);
  const g = only(r);
  assert.equal(new Set(g.questions.map((q) => q.key)).size, 2);
  assert.ok(types(r).includes('duplicate-key'));
});
