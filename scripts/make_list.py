#!/usr/bin/env python3
"""読み込み用ファイル.txt を作る

使い方:  python3 scripts/make_list.py            （media/ を走査）
        python3 scripts/make_list.py <フォルダ>  （回フォルダを置いた場所を指定）

・各回フォルダ（第1回 …）の中に、その回のファイル一覧（相対パス、1行1件）を書く
・置き場所の直下にも、回フォルダの一覧を書く
・「_」や「.」で始まるファイル・フォルダ、一覧ファイル自身は含めない
ローカルサーバー（python3 -m http.server）で使うだけなら実行しなくても動くが、
別のサーバーに置くときや一覧を固定したいときに実行する。
"""
import os
import sys

LIST = '読み込み用ファイル.txt'


def hidden(name: str) -> bool:
    return name.startswith('_') or name.startswith('.') or name == LIST


def list_round(round_dir: str) -> list:
    out = []
    for root, dirs, files in os.walk(round_dir):
        dirs[:] = sorted(d for d in dirs if not hidden(d))
        for f in sorted(files):
            if hidden(f):
                continue
            rel = os.path.relpath(os.path.join(root, f), round_dir)
            out.append(rel.replace(os.sep, '/'))
    return out


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'media')
    if not os.path.isdir(base):
        print(f'フォルダがありません: {base}')
        sys.exit(1)
    rounds = sorted(d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d)) and not hidden(d))
    if not rounds:
        print(f'回のフォルダ（第1回 など）が見つかりません: {base}')
        sys.exit(1)
    for r in rounds:
        files = list_round(os.path.join(base, r))
        with open(os.path.join(base, r, LIST), 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(files) + ('\n' if files else ''))
        print(f'{r}: {len(files)} ファイル → {r}/{LIST}')
    with open(os.path.join(base, LIST), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(rounds) + '\n')
    print(f'回の一覧 → {LIST}: {", ".join(rounds)}')


if __name__ == '__main__':
    main()
