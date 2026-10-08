#!/usr/bin/env python3
"""Google Fonts を fonts/ に保存して、オフラインでも同じ書体で表示できるようにする

目的:
  会場の PC がオフラインでも、index.html が使う Web フォント
  （Noto Serif JP / Oranienbaum / Zen Kaku Gothic New）を同じ見た目で出すため、
  オンラインのときに 1 回だけ実行して woff2 を手元に保存する。

使い方:
  python3 scripts/fetch_fonts.py             # 取得して fonts/ に保存（取得済みはスキップ）
  python3 scripts/fetch_fonts.py --dry-run   # CSS を読んで内訳と保存予定だけ表示（何も保存しない）
  python3 scripts/fetch_fonts.py --out <dir> # 保存先を変える（既定: <リポジトリ>/fonts）
  python3 scripts/fetch_fonts.py -q          # 進捗・一覧を出さない（要約とエラーだけ）
  python3 scripts/fetch_fonts.py -j 8        # 同時ダウンロード数（既定 6）

できるもの:
  fonts/files/<ファミリー>-<太さ>-<スタイル>-<番号>.woff2   （unicode-range ごとの分割ファイル）
  fonts/fonts.css                                            （同じ @font-face を相対パスで書いたもの）

そのあとの作業（このスクリプトは index.html も .gitignore も書き換えない）:
  1. index.html の Google Fonts の <link>（preconnect 2 行を含む）を外し、代わりに
       <link rel="stylesheet" href="fonts/fonts.css">
     を入れる。実行が成功すると、この行を最後に表示する。
  2. .gitignore に  fonts/  を 1 行足す（大きな OFL フォントなのでコミットしない）。

メモ:
  ・Google は User-Agent を見て配信形式を変えるため、Chrome 風の UA で CSS を取る
    （woff2 + unicode-range 分割で返る）。日本語フォントは数百ファイルに分かれる。
  ・index.html の Google Fonts の指定（書体・太さ）を変えたら、下の CSS_URL も同じにして再実行する。
  ・標準ライブラリだけで動く（Python 3.8 以上）。再実行しても取得済みファイルは取り直さない。
"""
from __future__ import annotations

import argparse
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

# index.html の Google Fonts の <link href> と同じ指定
CSS_URL = (
    'https://fonts.googleapis.com/css2'
    '?family=Noto+Serif+JP:wght@600;700'
    '&family=Oranienbaum'
    '&family=Zen+Kaku+Gothic+New:wght@400;500;700'
    '&display=swap'
)

# woff2 + unicode-range 分割で返してもらうための Chrome 風 UA
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')

REPO = Path(__file__).resolve().parent.parent
RETRIES = 3
TIMEOUT = 30

# コメント（サブセット名）+ @font-face { ... }
FACE_RE = re.compile(
    r'(?:/\*(?P<label>(?:(?!\*/).)*)\*/\s*)?@font-face\s*\{(?P<body>[^}]*)\}',
    re.S,
)
URL_RE = re.compile(r'url\(\s*[\'"]?([^\'")\s]+)[\'"]?\s*\)')


# ---------------------------------------------------------------- ネットワーク

def make_ssl_context() -> ssl.SSLContext:
    """通常の検証付き。Python 側に CA 束が無い macOS では OS の束（/etc/ssl/cert.pem）を使う。"""
    ctx = ssl.create_default_context()
    paths = ssl.get_default_verify_paths()
    has_default = bool(paths.cafile and os.path.exists(paths.cafile))
    if not has_default and os.path.exists('/etc/ssl/cert.pem'):
        ctx = ssl.create_default_context(cafile='/etc/ssl/cert.pem')
    return ctx


CTX = make_ssl_context()


def http_get(url: str):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    return urllib.request.urlopen(req, timeout=TIMEOUT, context=CTX)


def fetch_css() -> str:
    try:
        with http_get(CSS_URL) as r:
            return r.read().decode('utf-8')
    except ssl.SSLError as e:
        sys.exit('CSS を取得できません（証明書エラー）: %s\n'
                 '  Python.org 版なら「Install Certificates.command」を一度実行してください。' % e)
    except (urllib.error.URLError, OSError) as e:
        sys.exit('CSS を取得できません: %s\n  オンラインに接続してから実行してください。' % e)


# ---------------------------------------------------------------- 解析

class Face:
    """@font-face 1 ブロック分"""

    def __init__(self, label, family, style, weight, unicode_range, url):
        self.label = label
        self.family = family
        self.style = style
        self.weight = weight
        self.unicode_range = unicode_range
        self.url = url
        self.index = 0          # (ファミリー, 太さ, スタイル) 内の通し番号（1 始まり）
        self.filename = ''      # files/ 内のファイル名

    @property
    def group(self):
        return (self.family, self.weight, self.style)


def slugify(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-') or 'font'


def parse_faces(css: str) -> list:
    faces = []
    for m in FACE_RE.finditer(css):
        decl = {}
        for part in m.group('body').split(';'):
            key, sep, val = part.partition(':')
            if sep:
                decl[key.strip().lower()] = val.strip()
        family = decl.get('font-family', '').strip('\'" ')
        src = decl.get('src', '')
        um = URL_RE.search(src)
        if not family or not um:
            continue
        face = Face(
            label=(m.group('label') or '').strip(),
            family=family,
            style=decl.get('font-style', 'normal'),
            weight=decl.get('font-weight', '400'),
            unicode_range=decl.get('unicode-range', ''),
            url=um.group(1),
        )
        if 'woff2' not in src and not face.url.endswith('.woff2'):
            sys.exit('woff2 以外の形式が返りました（%s）。UA が Chrome と判定されなかった可能性があります。' % face.url)
        faces.append(face)
    return faces


def assign_filenames(faces: list) -> dict:
    """番号とファイル名を振る。同じ URL（可変フォントで太さ違いが同じファイルを指す場合）は 1 ファイルを共有。"""
    counters = {}
    by_url = {}
    for f in faces:
        counters[f.group] = counters.get(f.group, 0) + 1
        f.index = counters[f.group]
        name = '%s-%s-%s-%03d.woff2' % (slugify(f.family), slugify(f.weight), slugify(f.style), f.index)
        f.filename = by_url.setdefault(f.url, name)
    return by_url   # url -> ファイル名（重複なし）


# ---------------------------------------------------------------- 表示

def summarize(faces: list, by_url: dict) -> None:
    groups = {}
    for f in faces:
        groups.setdefault(f.group, []).append(f)
    print('@font-face ブロック: %d 個 / 固有のファイル: %d 個' % (len(faces), len(by_url)))
    print('ファミリー別（太さ・スタイルごとのサブセット数）:')
    families = {}
    for (family, weight, style), fs in groups.items():
        families.setdefault(family, []).append((weight, style, len(fs), len({x.url for x in fs})))
    for family, rows in families.items():
        total = sum(r[2] for r in rows)
        print('  %s  （計 %d ブロック）' % (family, total))
        for weight, style, n, uniq in rows:
            extra = '' if n == uniq else '（うち固有ファイル %d）' % uniq
            print('    weight %-9s %-7s %4d サブセット%s' % (weight, style, n, extra))


def gitignore_has_fonts() -> bool:
    gi = REPO / '.gitignore'
    try:
        lines = [ln.strip() for ln in gi.read_text(encoding='utf-8').splitlines()]
    except OSError:
        return False
    return any(ln in ('fonts', 'fonts/', '/fonts', '/fonts/') for ln in lines)


def display_path(p: Path) -> str:
    """リポジトリ内ならリポジトリからの相対パス、外なら絶対パス"""
    try:
        return p.resolve().relative_to(REPO).as_posix()
    except ValueError:
        return p.resolve().as_posix()


def link_href(out_dir: Path) -> str:
    return display_path(out_dir / 'fonts.css')


# ---------------------------------------------------------------- ダウンロード

def download(url: str, dest: Path):
    """戻り値: ('new' | 'skip', バイト数)。サイズが同じ既存ファイルがあれば本文を読まずスキップ。"""
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            with http_get(url) as r:
                cl = r.headers.get('Content-Length')
                expected = int(cl) if cl and cl.isdigit() else None
                if expected is not None and dest.exists() and dest.stat().st_size == expected:
                    return 'skip', expected
                data = r.read()
            if expected is not None and len(data) != expected:
                raise IOError('サイズ不一致（%d / %d）' % (len(data), expected))
            if data[:4] != b'wOF2':
                raise IOError('woff2 ではありません')
            tmp = dest.with_name(dest.name + '.part')
            tmp.write_bytes(data)
            os.replace(tmp, dest)
            return 'new', len(data)
        except (urllib.error.URLError, OSError, ssl.SSLError) as e:
            last = e
            if attempt < RETRIES:
                time.sleep(1.5 * attempt)
    raise RuntimeError('%s' % last)


def download_all(by_url: dict, files_dir: Path, jobs: int, quiet: bool):
    files_dir.mkdir(parents=True, exist_ok=True)
    total = len(by_url)
    done = new = skipped = 0
    nbytes = 0
    failed = []
    ex = ThreadPoolExecutor(max_workers=max(1, jobs))
    try:
        futs = {ex.submit(download, url, files_dir / name): (url, name) for url, name in by_url.items()}
        for fut in as_completed(futs):
            url, name = futs[fut]
            done += 1
            try:
                status, size = fut.result()
            except Exception as e:  # noqa: BLE001 - 1 件の失敗で全体を止めない
                failed.append((name, url, e))
                print('[%d/%d] 失敗  %s  %s' % (done, total, name, e), file=sys.stderr)
                continue
            nbytes += size
            if status == 'new':
                new += 1
            else:
                skipped += 1
            if not quiet:
                print('[%d/%d] %-4s  %-42s %8.1f KB' % (
                    done, total, '新規' if status == 'new' else '済み', name, size / 1024))
    except KeyboardInterrupt:
        ex.shutdown(wait=False, cancel_futures=True)
        sys.exit('\n中断しました。再実行すると取得済みのファイルはスキップされます。')
    ex.shutdown(wait=True)
    return new, skipped, nbytes, failed


def write_css(faces: list, out_dir: Path) -> Path:
    lines = [
        '/* scripts/fetch_fonts.py が生成（%s）。手で編集しない。' % date.today().isoformat(),
        '   元: %s */' % CSS_URL,
        '',
    ]
    for f in faces:
        if f.label:
            lines.append('/* %s */' % f.label)
        lines += [
            '@font-face {',
            "  font-family: '%s';" % f.family,
            '  font-style: %s;' % f.style,
            '  font-weight: %s;' % f.weight,
            '  font-display: swap;',
            "  src: url('files/%s') format('woff2');" % f.filename,
        ]
        if f.unicode_range:
            lines.append('  unicode-range: %s;' % f.unicode_range)
        lines += ['}', '']
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / 'fonts.css'
    path.write_text('\n'.join(lines), encoding='utf-8')
    return path


# ---------------------------------------------------------------- main

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description='Google Fonts を fonts/ に保存する（会場のオフライン表示用。オンライン時に 1 回実行）')
    ap.add_argument('--dry-run', action='store_true',
                    help='CSS を取得して内訳と保存予定だけ表示する（何もダウンロード・保存しない）')
    ap.add_argument('--out', default=str(REPO / 'fonts'), metavar='DIR',
                    help='保存先（既定: <リポジトリ>/fonts）')
    ap.add_argument('-q', '--quiet', action='store_true', help='進捗・一覧を出さない')
    ap.add_argument('-j', '--jobs', type=int, default=6, help='同時ダウンロード数（既定 6）')
    args = ap.parse_args(argv)

    out_dir = Path(args.out).expanduser().resolve()
    files_dir = out_dir / 'files'

    css = fetch_css()
    faces = parse_faces(css)
    if not faces:
        sys.exit('@font-face が見つかりません。Google 側の形式が変わった可能性があります。')
    by_url = assign_filenames(faces)

    print('CSS 取得: %d バイト（%d ブロック）' % (len(css.encode('utf-8')), len(faces)))
    summarize(faces, by_url)

    if args.dry_run:
        print('合計サイズ: 不明（Google の CSS にサイズ情報は無い。実行時に合計を表示）')
        print('保存先: %s' % out_dir)
        if not args.quiet:
            print('保存予定（%d ファイル）:' % len(by_url))
            for url, name in by_url.items():
                print('  %s  <-  %s' % (display_path(files_dir / name), url))
        print('ドライラン: ダウンロードも書き込みもしていません。')
        return 0

    print('保存先: %s' % out_dir)
    new, skipped, nbytes, failed = download_all(by_url, files_dir, args.jobs, args.quiet)
    if failed:
        print('\n%d ファイルを取得できませんでした。fonts.css は書き出していません。'
              '再実行すると取得済みはスキップされます。' % len(failed), file=sys.stderr)
        for name, url, err in failed[:10]:
            print('  %s  %s' % (name, err), file=sys.stderr)
        return 1

    css_path = write_css(faces, out_dir)
    print('\n完了: %d ファイル（新規 %d / 取得済みでスキップ %d）、合計 %.1f MB' % (
        len(by_url), new, skipped, nbytes / 1024 / 1024))
    print('書き出し: %s' % css_path)

    href = link_href(out_dir)
    print('\n--- 次にやること（このスクリプトは下の 2 つを自動では編集しません）---')
    print('1) index.html の <head> で、Google Fonts の preconnect 2 行と stylesheet の <link> を外し、')
    print('   次の 1 行に置き換える:')
    print('     <link rel="stylesheet" href="%s">' % href)
    print('2) .gitignore に次の 1 行を足す（大きな OFL フォントなのでコミットしない）:')
    print('     fonts/' + ('   ← すでに入っています' if gitignore_has_fonts() else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
