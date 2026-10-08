#!/usr/bin/env python3
"""読み込み用ファイル.txt を作る

使い方:  python3 scripts/make_list.py            （media/ を走査）
        python3 scripts/make_list.py <フォルダ>  （回フォルダを置いた場所を指定）
        python3 scripts/make_list.py --stdout [<フォルダ>]  （書き込まずに一覧を表示するだけ）

・各回フォルダ（第1回 …）の中に、その回のファイル一覧（回フォルダからの相対パス、1行1件）を書く
・フォルダも「フォルダ名/」の行で書く（空フォルダを読み込みレポートに出すため）
・置き場所の直下にも、回フォルダの一覧を書く
・含めないもの：「.」で始まるファイル・フォルダ、「_」で始まるフォルダ（中身ごと）、
  「_」で始まる .txt 以外のファイル、一覧ファイル自身。「_曲名.txt」のようなメモは含める
・名前は NFC に揃えて書く
・Google Drive（~/Library/CloudStorage、リポジトリの drive リンク、~/Google Drive）の中では実行しない。
  運営の共有フォルダに一覧ファイルを書き込んでしまうため（--stdout は書き込まないので可）

ローカルサーバー（python3 -m http.server）で使うだけなら実行しなくても動く。
注意：一覧ファイルがあるとサイトはそれだけを読む。ファイルを足したら必ず実行し直すこと
（古い一覧ファイルが新しいファイルを隠す）。
"""
import os
import sys
import unicodedata

LIST = '読み込み用ファイル.txt'
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def nfc(s: str) -> str:
    return unicodedata.normalize('NFC', s)


def hidden_dir(name: str) -> bool:
    return not name or name.startswith('.') or name.startswith('_')


def hidden_file(name: str) -> bool:
    if not name or name.startswith('.') or nfc(name) == nfc(LIST):
        return True
    return name.startswith('_') and not name.lower().endswith('.txt')


def drive_reason(base: str):
    """Drive の中なら理由を返す（書き込み禁止）"""
    real = os.path.realpath(base)
    home = os.path.expanduser('~')
    guards = [
        (os.path.realpath(os.path.join(home, 'Library', 'CloudStorage')), '~/Library/CloudStorage（Google Drive for desktop）の中です'),
        (os.path.realpath(os.path.join(home, 'Google Drive')), '~/Google Drive（Drive のミラー）の中です'),
    ]
    drive_link = os.path.join(REPO, 'drive')
    if os.path.lexists(drive_link):
        guards.append((os.path.realpath(drive_link), 'リポジトリの drive リンクの先（運営の共有フォルダ）です'))
    for g, why in guards:
        if real == g or real.startswith(g + os.sep):
            return why
    # 解決前のパスが drive リンクを通っている場合も止める
    absb = os.path.abspath(base)
    if absb == drive_link or absb.startswith(drive_link + os.sep):
        return 'リポジトリの drive リンクを通っています'
    if 'GoogleDrive-' in real or os.sep + 'Google Drive' + os.sep in real + os.sep:
        return 'Google Drive のフォルダのようです'
    return None


def list_round(round_dir: str) -> list:
    out = []
    for root, dirs, files in os.walk(round_dir):
        dirs[:] = sorted(d for d in dirs if not hidden_dir(d))
        rel_root = os.path.relpath(root, round_dir)
        if rel_root != '.':
            out.append(nfc(rel_root.replace(os.sep, '/')) + '/')
        for f in sorted(files):
            if hidden_file(f):
                continue
            rel = os.path.relpath(os.path.join(root, f), round_dir)
            out.append(nfc(rel.replace(os.sep, '/')))
    return out


def main():
    args = sys.argv[1:]
    to_stdout = '--stdout' in args
    args = [a for a in args if a != '--stdout']
    base = args[0] if args else os.path.join(REPO, 'media')
    if not os.path.isdir(base):
        print(f'フォルダがありません: {base}')
        sys.exit(1)
    why = drive_reason(base)
    if why and not to_stdout:
        print(f'実行しません：{base} は {why}')
        print('Drive の共有フォルダに一覧ファイルを書き込まないため。media/ にコピーしてから実行するか、--stdout で表示だけしてください。')
        sys.exit(2)
    rounds = sorted(d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d)) and not hidden_dir(d))
    if not rounds:
        print(f'回のフォルダ（第1回 など）が見つかりません: {base}')
        sys.exit(1)
    for r in rounds:
        lines = list_round(os.path.join(base, r))
        nfiles = sum(1 for l in lines if not l.endswith('/'))
        if to_stdout:
            print(f'# {nfc(r)}/{LIST}（{nfiles} ファイル、{len(lines) - nfiles} フォルダ）')
            print('\n'.join(lines))
            continue
        with open(os.path.join(base, r, LIST), 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(lines) + ('\n' if lines else ''))
        print(f'{nfc(r)}: {nfiles} ファイル・{len(lines) - nfiles} フォルダ → {nfc(r)}/{LIST}')
    if to_stdout:
        return
    with open(os.path.join(base, LIST), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(nfc(r) for r in rounds) + '\n')
    print(f'回の一覧 → {LIST}: {", ".join(nfc(r) for r in rounds)}')


if __name__ == '__main__':
    main()
