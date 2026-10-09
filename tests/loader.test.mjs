// ローダー v3 のテスト（node --test）。名前はすべてダミー
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

test('先頭が数字のサブジャンル（01_サブA・02_サブB）は問題フォルダにしない：group が残り、キーがぶつからない', () => {
  const d = '文章_テスト_減点方式';
  const r = parse([`${d}/02_サブB/第1問/x_①.png`, `${d}/02_サブB/第1問/x_解答.png`, `${d}/01_サブA/第1問/x_①.png`, `${d}/01_サブA/第1問/x_解答.png`,
    `${d}/10_サブC/第1問/x_①.png`, `${d}/10_サブC/第1問/x_解答.png`]);
  const g = only(r);
  assert.deepEqual(g.questions.map((q) => q.key), ['01_サブA~1', '02_サブB~1', '10_サブC~1'], '数字順に並ぶ');
  assert.deepEqual(g.questions.map((q) => q.group), ['01_サブA', '02_サブB', '10_サブC']);
  assert.deepEqual(types(r), []);
});

test('「1 サブ/初級/…」も group＋level として読む', () => {
  const d = '文章_テスト_減点方式/1 サブ/初級';
  const r = parse([`${d}/x_①.png`, `${d}/x_解答.png`]);
  const q = q1(r);
  assert.equal(q.group, '1 サブ'); assert.equal(q.level.label, '初級'); assert.equal(q.key, '1 サブ~初級~1');
  assert.deepEqual(types(r), []);
});

test('ファイルを直接持つ「01_サブ」も group（unknown-suffix の警告は出さない）', () => {
  const d = '文章_テスト_減点方式/01_サブ';
  const r = parse([`${d}/x_①.png`, `${d}/x_解答.png`]);
  const q = q1(r);
  assert.equal(q.group, '01_サブ'); assert.equal(q.key, '01_サブ~1'); assert.equal(q.scoringSource, 'genre');
  assert.deepEqual(types(r), []);
});

test('サブフォルダを持つ「第1問_xxx」は group、サブフォルダの無い「第1問_xxx」は問題（警告）', () => {
  const d = '文章_テスト_減点方式';
  const r = parse([`${d}/第1問_xxx/第2問/x_①.png`, `${d}/第1問_xxx/第2問/x_解答.png`, `${d}/第3問_yyy/z_①.png`, `${d}/第3問_yyy/z_解答.png`]);
  const g = only(r);
  assert.deepEqual(g.questions.map((q) => q.key), ['3', '第1問_xxx~2']);
  assert.deepEqual(r.warnings.filter((w) => w.type === 'unknown-suffix').map((w) => w.path), [`${d}/第3問_yyy`]);
});

test('questionFolderOf：知っている接尾辞だけなら問題フォルダ、裸の数字＋知らない語はサブジャンル', () => {
  const f = L._internal.questionFolderOf;
  for (const n of ['1', '01', '第1問', '問題2', '問題2_減点方式', '3_点数方式_3点', '4_逆転', '5_2点']) assert.ok(f(n, false), n);
  for (const n of ['01_サブ', '1 サブ', '2-サブ']) assert.equal(f(n, false), null, n);
  assert.ok(f('問題1_xxx', false)); assert.equal(f('問題1_xxx', true), null);
  assert.ok(f('第1問', true), '接尾辞が無ければサブフォルダがあっても問題フォルダ');
});

/* ---------- ローダー v3 仕上げ（レビュー指摘の修正）。名前はすべてダミー ---------- */
const GD = '文章_テスト_減点方式';
const stagedWithAnswer = (dir, stem = 'x', n = 1) => [...staged(dir, stem, n), `${dir}/${stem}_解答.png`];

test('levelOf：constructor・toString など継承プロパティは級ではない', () => {
  const lv = L._internal.levelOf;
  for (const n of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'isPrototypeOf']) assert.equal(lv(n), null, n);
  assert.deepEqual(lv('初級'), { label: '初級', rank: 3, points: 1 });
  assert.deepEqual(lv(' 上級 '), { label: '上級', rank: 1, points: 5 });
  const r = parse(stagedWithAnswer(`${GD}/constructor/第1問`));
  const q = q1(r);
  assert.equal(q.group, 'constructor'); assert.equal(q.level, null); assert.equal(q.key, 'constructor~1');
  assert.deepEqual(types(r), []);
});

test('接尾辞の優先：逆転は並び順に関係なく 点数方式／N点 に勝つ（clips＋減点）、食い違いは suffix-conflict', () => {
  for (const sfx of ['逆転_3点', '3点_逆転', '逆転_点数方式', '点数方式_逆転', '点数方式_3点_逆転', '逆転_点数方式_3点']) {
    const dir = `${GD}/問題1_${sfx}`;
    const r = parse(stagedWithAnswer(dir, 'x', 3));
    const q = q1(r);
    assert.equal(q.mode, 'clips', sfx); assert.equal(q.scoring, 'deduct', sfx); assert.equal(q.scoringSource, 'suffix', sfx);
    assert.equal(q.scoringLabel, '逆転', sfx);
    assert.deepEqual(q.points, [5, 2, 1], sfx);
    assert.equal(q.tierRank, null, sfx);
    const w = r.warnings.filter((x) => x.type === 'suffix-conflict');
    assert.equal(w.length, 1, sfx); assert.equal(w[0].path, dir); assert.equal(w[0].genre, GD);
  }
});

test('接尾辞の優先：減点方式 は 点数方式／N点 に勝つ（並び順に関係なく）', () => {
  for (const sfx of ['減点方式_点数方式', '点数方式_減点方式', '減点方式_3点', '3点_減点方式']) {
    const r = parse(stagedWithAnswer(`${GD}/問題2_${sfx}`, 'x', 3));
    const q = q1(r);
    assert.equal(q.scoring, 'deduct', sfx); assert.equal(q.scoringLabel, '減点方式', sfx); assert.equal(q.mode, 'staged', sfx);
    assert.deepEqual(q.points, [5, 2, 1], sfx);
    assert.deepEqual(types(r), ['suffix-conflict'], sfx);
  }
});

test('接尾辞：矛盾しない組み合わせは警告なし／N点が複数ならいちばん左を使って警告', () => {
  const f = L._internal.parseQuestionFolder;
  for (const n of ['問題1_点数方式_3点', '問題1_3点_点数方式', '問題1_逆転_減点方式', '問題1_減点方式_逆転', '問題1_減点方式', '問題1_点数方式_点数方式', '問題1_3点_3点', '問題1_逆転']) {
    assert.deepEqual(f(n).conflict, [], n);
  }
  assert.equal(f('問題1_逆転_減点方式').reverse, true); assert.equal(f('問題1_逆転_減点方式').scoring, 'deduct');
  assert.equal(f('問題1_点数方式_3点').fixedPoints, 3); assert.equal(f('問題1_点数方式_3点').suffixLabel, '点数方式_3点');
  const m = f('問題1_3点_5点');
  assert.equal(m.scoring, 'points'); assert.equal(m.fixedPoints, 3); assert.equal(m.conflict.length, 1); assert.equal(m.suffixLabel, '3点');
  const r = parse(stagedWithAnswer(`${GD}/問題1_5点_2点`, 'x', 2));
  const q = q1(r);
  assert.equal(q.scoring, 'points'); assert.equal(q.pointsValue, 5); assert.deepEqual(q.points, [5, 5]); assert.equal(q.tierRank, 1);
  assert.deepEqual(types(r), ['suffix-conflict']);
  // 逆転・減点が勝ったときは N点 を持ち越さない
  assert.equal(f('問題1_逆転_3点').fixedPoints, null); assert.equal(f('問題1_減点方式_3点').fixedPoints, null);
});

// ディレクトリ一覧 HTML を返す偽の fetch（tree：フォルダ → 中身の名前（フォルダは末尾 /）。無いフォルダは 404）
function fakeListingFetch(tree, { base = 'media', fail = [] } = {}) {
  const html = (names) => `<!DOCTYPE HTML><html><head><title>Directory listing for /</title></head><body><ul>${names.map((n) => `<li><a href="${encodeURIComponent(n.replace(/\/$/, ''))}${n.endsWith('/') ? '/' : ''}">${n}</a></li>`).join('')}</ul></body></html>`;
  return async (url) => {
    const rel = String(url).replace(new RegExp('^' + base + '/?'), '').split('/').filter(Boolean).map(decodeURIComponent).join('/');
    if (fail.includes(rel)) throw new Error('network');
    return rel in tree ? new Response(html(tree[rel]), { status: 200, headers: { 'content-type': 'text/html' } }) : new Response('', { status: 404 });
  };
}

test('walk：深さの上限と読めなかったフォルダは印の行（#too-deep / #unreadable）で返す', async () => {
  const tree = {
    '第1回': ['G/'],
    '第1回/G': ['A/', 'B/', 'C/', '_下書き/'],
    '第1回/G/A': ['x_①.png', 'deep/', '_隠し/', '.cache/'],   // 深さ 0：deep/ は読まない
    '第1回/G/B': ['y_①.png'],
    // 第1回/G/C は一覧が取れない（404）
    '第1回/G/A/deep': ['z.png'],
  };
  const { L: LL } = loadQuizLoader({ fetchImpl: fakeListingFetch(tree) });
  const lines = await LL._internal.walk('第1回', 2, 'media');
  const strip = lines.map((l) => l.slice('第1回/'.length));
  assert.ok(strip.includes('G/A/#too-deep'), strip.join('\n'));
  assert.ok(strip.includes('G/C/#unreadable'), strip.join('\n'));
  assert.ok(strip.includes('G/C/'), '読めなかったフォルダの「名前/」の行も残す');
  assert.ok(strip.includes('G/A/x_①.png') && strip.includes('G/B/y_①.png'));
  assert.ok(!strip.some((l) => l.includes('deep/z.png')), '深い所のファイルは読まない');
  assert.ok(!strip.some((l) => l.includes('隠し') || l.includes('下書き') || l.includes('.cache')), '隠しフォルダは印にもしない');
  assert.ok(!strip.some((l) => l.endsWith('#too-deep/') || l.endsWith('#unreadable/')), '印の行は「/」で終わらない');
  assert.equal(strip.filter((l) => l.endsWith('#too-deep')).length, 1, '1 フォルダにつき 1 行');
  // ネットワークエラーも unreadable
  const { L: L2 } = loadQuizLoader({ fetchImpl: fakeListingFetch(tree, { fail: ['第1回/G/B'] }) });
  const l2 = (await L2._internal.walk('第1回', 2, 'media')).map((l) => l.slice('第1回/'.length));
  assert.ok(l2.includes('G/B/#unreadable'));
  // parse() が警告にする：空フォルダとは言わない
  const r = parse(strip);
  const t = r.warnings.filter((w) => w.type === 'too-deep' || w.type === 'unreadable').map((w) => [w.type, w.path, w.genre]);
  assert.deepEqual(t.sort(), [['too-deep', 'G/A', 'G'], ['unreadable', 'G/C', 'G']].sort());
  assert.ok(!types(r).includes('empty'), types(r).join());
});

test('parse：印の行だけのフォルダは empty ではなく too-deep / unreadable', () => {
  const r = parse([`${GD}/第1問/`, `${GD}/第1問/#too-deep`, `${GD}/第2問/`, `${GD}/第2問/#unreadable`, `${GD}/第3問/`, `${GD}/第3問/#too-deep`, `${GD}/第3問/#too-deep`,
    ...stagedWithAnswer(`${GD}/第4問`)]);
  assert.equal(q1(r).key, '4');
  assert.deepEqual(r.warnings.map((w) => [w.type, w.path]).sort(), [['too-deep', `${GD}/第1問`], ['too-deep', `${GD}/第3問`], ['unreadable', `${GD}/第2問`]].sort());
  // 隠しフォルダの印は無視、回の直下の印は回の警告
  const r2 = parse([`${GD}/_下書き/#too-deep`, '#unreadable', ...stagedWithAnswer(`${GD}/第1問`)]);
  assert.deepEqual(r2.warnings.map((w) => w.type), ['unreadable']);
  assert.equal(r2.fileCount, 2);
});

test('名前が重複（第1問 と 第１問）：duplicate-name を警告、後のフォルダのファイルも同じ問題に読む', () => {
  const r = parse([`${GD}/第1問/x_①.png`, `${GD}/第１問/x_②.png`, `${GD}/第１問/x_解答.png`]);
  const q = q1(r);
  assert.deepEqual(q.stages.map((s) => s.n), [1, 2]); assert.ok(q.answer.image);
  assert.ok(q.stages[0].src.includes(encodeURIComponent('第1問')) && q.stages[1].src.includes(encodeURIComponent('第１問')), 'URL はそれぞれ元の名前');
  const d = r.warnings.filter((w) => w.type === 'duplicate-name');
  assert.equal(d.length, 1); assert.equal(d[0].path, `${GD}/第1問`); assert.equal(d[0].genre, GD);
  assert.deepEqual(types(r), ['duplicate-name']);
  // ジャンルの階層でも、ファイルでも
  const r2 = parse([...stagedWithAnswer('文章_テスト１_減点方式/第1問'), ...stagedWithAnswer('文章_テスト1_減点方式/第2問')]);
  assert.equal(r2.genres.length, 1); assert.equal(r2.genres[0].questions.length, 2);
  assert.ok(types(r2).includes('duplicate-name'));
  const r3 = parse([`${GD}/第1問/画像1_①.png`, `${GD}/第1問/画像１_①.png`, `${GD}/第1問/画像1_解答.png`]);
  assert.equal(q1(r3).stages.length, 1); assert.deepEqual(types(r3), ['duplicate-name']);
});

test('NFC と NFD の同じ名前は duplicate-name にしない', () => {
  const a = `${GD}/ガ行/第1問/x_①.png`;
  const r = parse([a, a.normalize('NFD'), `${GD}/ガ行/第1問/x_解答.png`.normalize('NFD'), `${GD}/ガ行/第1問/`.normalize('NFD')]);
  assert.equal(q1(r).key, 'ガ行~1'); assert.deepEqual(types(r), []);
  assert.equal(r.fileCount, 2);
});

test('stripPrefix：NFD の行も NFC の回名で切れる（長さではなく NFC の一致位置）。残りは元の綴り', () => {
  const sp = L._internal.stripPrefix;
  const round = 'ガギ回', body = 'パ/ゲ_①.png';
  assert.equal(sp(`${round}/${body}`, `${round}/`), body);
  assert.equal(sp(`${round}/${body}`.normalize('NFD'), `${round}/`), body.normalize('NFD'), 'NFD の行：残りは NFD のまま');
  assert.equal(sp(`${round}/${body}`, `${round}/`.normalize('NFD')), body, 'NFD の接頭辞でも切れる');
  assert.equal(sp(`media/${round}/${body}`.normalize('NFD'), `media/${round}/`), body.normalize('NFD'));
  assert.equal(sp('別の回/x.png', `${round}/`), null);
  assert.equal(sp(`${round}`, `${round}/`), null);
});

test('一覧ファイル：NFD の行と NFC の回名でも、回の接頭辞が正しく切れて問題になる', async () => {
  const round = 'ガギ回'; // NFD にすると 2 文字長くなる（濁点）
  const names = [...stagedWithAnswer(`${GD}/第1問`, 'ガ')].map((l) => `${round}/${l}`);
  const files = new Map([
    ['読み込み用ファイル.txt', `${round}/\n`],
    [`${round}/読み込み用ファイル.txt`, names.map((n) => n.normalize('NFD')).join('\n') + '\n'],
  ]);
  const fetchImpl = async (url) => {
    const rel = String(url).replace(/^media\/?/, '').split('/').filter(Boolean).map((s) => decodeURIComponent(s).normalize('NFC')).join('/');
    return files.has(rel) ? new Response(files.get(rel), { status: 200, headers: { 'content-type': 'text/plain' } }) : new Response('', { status: 404 });
  };
  const { L: LL } = loadQuizLoader({ fetchImpl, mediaBases: ['media'] });
  await LL.discoverRounds();
  const r = await LL.loadRound(round);
  assert.equal(r.source, 'list');
  assert.equal(r.genres.length, 1); assert.equal(r.genres[0].id, GD, '回名の長さで切り損ねるとジャンル名がずれる');
  const q = r.genres[0].questions[0];
  assert.equal(q.key, '1'); assert.equal(q.stages.length, 1); assert.ok(q.answer.image); assert.equal(r.fileCount, 2);
  assert.deepEqual(r.warnings, []);
});

test('.txt の印：「_ 空白 -」の直後か名前の先頭にあるときだけ（曲名の途中の ① や末尾の「答え」はメモ）', () => {
  const c = (n) => L._internal.classify(n, true);
  const marker = (n) => c(n).marker;
  // メモ（印なし）
  for (const n of ['_曲名.txt', '曲名①.txt', '_曲名①.txt', 'ダミーの答え.txt', '_ダミーの答え.txt', 'ダミー正解.txt', 'ダミー回答.txt', '曲名ver2.txt', '_ver1.txt', '_①題名.txt', '_①.txt', 'x_曲名.txt', '_曲名 人名.txt', '_Dummy you!.txt', 'あのanswer.txt']) assert.equal(marker(n), null, n);
  // 印
  assert.deepEqual(c('題名_①.txt'), { marker: 'stage', n: 1, stem: '題名' });
  assert.deepEqual(c('題名 ③.txt'), { marker: 'stage', n: 3, stem: '題名' });
  assert.deepEqual(c('①.txt'), { marker: 'stage', n: 1, stem: '' });
  assert.deepEqual(c('題名_ver2.txt'), { marker: 'stage', n: 2, stem: '題名' });
  assert.deepEqual(c('題名_答え.txt'), { marker: 'answer', n: null, stem: '題名' });
  assert.deepEqual(c('題名-解答.txt'), { marker: 'answer', n: null, stem: '題名' });
  assert.deepEqual(c('解答.txt'), { marker: 'answer', n: null, stem: '' });
  assert.deepEqual(c('解答_題名.txt'), { marker: 'answer', n: null, stem: '題名' });
  assert.equal(marker('題名_問題.txt'), 'question');
  assert.equal(marker('題名問題.txt'), null);
  // 画像・音声・動画は今までどおり（区切りが無くても印）
  const m = L._internal.classify;
  assert.deepEqual(m('曲名①.png'), { marker: 'stage', n: 1, stem: '曲名' });
  assert.deepEqual(m('ダミーの答え.png'), { marker: 'answer', n: null, stem: 'ダミーの' });
  assert.deepEqual(m('_①.png'), { marker: 'stage', n: 1, stem: '' });
});

test('.txt の印：問題の中では 曲名①.txt や ダミーの答え.txt はメモ（答えの文字）になる', () => {
  const d = `${GD}/第1問`;
  const r = parse([...stagedWithAnswer(d), `${d}/ダミーの答え①.txt`]);
  const q = q1(r);
  assert.equal(q.notes.length, 1); assert.equal(q.answer.text, 'ダミーの答え①'); assert.equal(q.stages.length, 1);
  assert.deepEqual(types(r), []);
  const r2 = parse([...staged(d, 'x', 2), `${d}/ダミーの答え.txt`]);
  const q2 = q1(r2);
  assert.equal(q2.answer.text, 'ダミーの答え'); assert.deepEqual(q2.stages.map((s) => s.n), [1, 2]); assert.deepEqual(types(r2), []);
  // 区切りの後ろの 解答 は今までどおり答えの文字ファイル
  const r3 = parse([...staged(d, 'x', 1), `${d}/x_解答.txt`]);
  const q3 = q1(r3);
  assert.ok(q3.answer.textSrc.endsWith(encodeURIComponent('x_解答.txt'))); assert.equal(q3.notes.length, 0);
});

test('正規表現の暴走防止：長い区切りの列・数字の列でも一瞬で終わる', () => {
  const N = 200000;
  const t0 = performance.now();
  const c = L._internal.classify;
  assert.equal(c('a' + '_'.repeat(N) + 'b.png').marker, null);
  assert.equal(c('a' + '_'.repeat(N) + 'b.txt', true).marker, null);
  assert.equal(c('_'.repeat(N) + 'x.png').stem, 'x');
  assert.equal(c('x' + '-'.repeat(N) + '答え.png').marker, 'answer');
  assert.equal(c('x' + '-'.repeat(N) + 'ver12.png').n, 12);
  assert.equal(c('x' + ' '.repeat(N) + 'ver.png').marker, null);
  assert.equal(c('x' + ' '.repeat(N) + 'ver123.png').marker, null);
  assert.equal(L._internal.trimSep('a' + '_'.repeat(N) + 'b'), 'a' + '_'.repeat(N) + 'b');
  assert.equal(L._internal.trimSep('_'.repeat(N)), '');
  const r = parse([`${GD}/第1問/${'1'.repeat(N)}x_①.png`, `${GD}/第1問/${'1'.repeat(N)}x_解答.png`]);
  assert.equal(q1(r).stages.length, 1);
  assert.ok(performance.now() - t0 < 2000, `遅すぎる：${performance.now() - t0}ms`);
});

test('classify は今までの規則のまま（非 strict）：区切りの有無・大文字小文字・ver の桁', () => {
  const c = L._internal.classify;
  assert.deepEqual(c('x_ANSWER.png'), { marker: 'answer', n: null, stem: 'x' });
  assert.deepEqual(c('answerx.png'), { marker: 'answer', n: null, stem: 'x' });
  assert.deepEqual(c('x_VER03.png'), { marker: 'stage', n: 3, stem: 'x' });
  assert.deepEqual(c('x  ver3 y.png'), { marker: 'stage', n: 3, stem: 'x y' });
  assert.equal(c('xver3.png').marker, null);
  assert.equal(c('x_ver123.png').marker, null);
  assert.deepEqual(c('x_ver4_解答.png'), { marker: 'answer', n: null, stem: 'x_ver4' });
  assert.deepEqual(c('a①b②.png'), { marker: 'stage', n: 2, stem: 'a①b' });
  assert.deepEqual(c('x_㉑.mp3'), { marker: 'stage', n: 21, stem: 'x' });
  assert.deepEqual(c('x_question.mp4'), { marker: 'question', n: null, stem: 'x' });
});

test('番号付きの問題フォルダに幹が複数：キーは <フォルダの番号>-<何番目か>（他の問題とぶつけない）', () => {
  const lines = [
    ...stagedWithAnswer(`${GD}/第1問`), ...stagedWithAnswer(`${GD}/第2問`),
    ...stagedWithAnswer(`${GD}/第5問`, '05画像', 2), ...stagedWithAnswer(`${GD}/第5問`, '05 画像', 2),
  ];
  const r = parse(lines);
  const g = only(r);
  assert.equal(g.questions.length, 4);
  assert.deepEqual(g.questions.map((q) => q.key).sort(), ['1', '2', '5-1', '5-2']);
  assert.ok(!types(r).includes('duplicate-key'), types(r).join());
  const multi = g.questions.filter((q) => q.key.startsWith('5-'));
  assert.deepEqual(multi.map((q) => q.stages.length), [2, 2]);
  assert.ok(multi.every((q) => q.folder === `${GD}/第5問` && q.answer.image && q.scoring === 'deduct'));
  assert.deepEqual(multi.map((q) => q.key).sort(), ['5-1', '5-2']);
  assert.notEqual(multi[0].stem, multi[1].stem);
});

test('番号付きの問題フォルダ：末尾が数字の幹が複数でも <番号>-<何番目か>、メモの警告は今までどおり', () => {
  const d = `${GD}/問題7`;
  const r = parse([`${d}/動画1_問題.mp4`, `${d}/動画1_正解.mp4`, `${d}/動画2_問題.mp4`, `${d}/動画2_正解.mp4`, `${d}/_メモ.txt`, ...stagedWithAnswer(`${GD}/第1問`)]);
  const g = only(r);
  assert.deepEqual(g.questions.map((q) => q.key).sort(), ['1', '7-1', '7-2']);
  assert.ok(types(r).includes('multi-stem-note'));
  assert.ok(!types(r).includes('duplicate-key'));
  assert.deepEqual(g.questions.filter((q) => q.mode === 'pair').map((q) => q.id).sort(), [1, 2], 'id・ラベルは今までどおり（幹の末尾の数字）');
});

test('番号の無い葉（級フォルダ）の幹が複数なら、キーは今までどおり 級~番号', () => {
  const g = only(parse(['動画_テスト_点数方式/初級/甲_動画_問題.mp4', '動画_テスト_点数方式/初級/甲_動画_正解.mp4', '動画_テスト_点数方式/初級/乙_動画_問題.mp4', '動画_テスト_点数方式/初級/乙_動画_正解.mp4']));
  assert.deepEqual(g.questions.map((q) => q.key), ['初級~1', '初級~2']);
});
