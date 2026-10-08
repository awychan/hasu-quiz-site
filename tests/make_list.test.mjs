// make_list.py が Google Drive の中に書き込まないこと（node --test）。偽の HOME で Drive を真似る。名前はダミー
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, lstatSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'make_list.py');
const LIST = '読み込み用ファイル.txt';
const hasPython = spawnSync('python3', ['--version']).status === 0;

function fakeHome() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'make-list-')));
  const drive = join(home, 'Library', 'CloudStorage', 'GoogleDrive-dummy', '共有');
  const round = (root, name) => { const d = join(root, name, '文章_A', '第1問'); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'a_①.png'), ''); return join(root, name); };
  return { home, drive, round, run: (...args) => spawnSync('python3', [SCRIPT, ...args], { env: { ...process.env, HOME: home }, encoding: 'utf-8' }) };
}

test('回フォルダが Drive へのシンボリックリンクなら何も書かない', { skip: !hasPython }, () => {
  const h = fakeHome();
  try {
    const target = h.round(h.drive, '第1回');
    const base = join(h.home, 'base'); mkdirSync(base);
    symlinkSync(target, join(base, '第1回'));
    h.round(base, '第2回');
    const r = h.run(base);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.ok(!existsSync(join(target, LIST)), 'Drive の中に一覧ファイルが無い');
    assert.ok(!existsSync(join(base, LIST)) && !existsSync(join(base, '第2回', LIST)), '途中まで書かない');
    assert.equal(h.run('--stdout', base).status, 0, '--stdout は書かないので可');
  } finally { rmSync(h.home, { recursive: true, force: true }); }
});

test('一覧ファイル自体が Drive へのリンクなら書かない', { skip: !hasPython }, () => {
  const h = fakeHome();
  try {
    mkdirSync(h.drive, { recursive: true });
    const base = join(h.home, 'base'); mkdirSync(base);
    const round = h.round(base, '第1回');
    symlinkSync(join(h.drive, LIST), join(round, LIST));
    const r = h.run(base);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.ok(!existsSync(join(h.drive, LIST)));
    assert.ok(lstatSync(join(round, LIST)).isSymbolicLink());
  } finally { rmSync(h.home, { recursive: true, force: true }); }
});

test('置き場所そのものが Drive の中なら書かない／Drive の外なら書く', { skip: !hasPython }, () => {
  const h = fakeHome();
  try {
    h.round(h.drive, '第1回');
    assert.equal(h.run(h.drive).status, 2);
    assert.ok(!existsSync(join(h.drive, LIST)));
    const base = join(h.home, 'base'); mkdirSync(base); h.round(base, '第1回');
    const r = h.run(base);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(existsSync(join(base, LIST)) && existsSync(join(base, '第1回', LIST)));
  } finally { rmSync(h.home, { recursive: true, force: true }); }
});
