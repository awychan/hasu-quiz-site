#!/usr/bin/env python3
"""Google Drive for desktop で同期した「出題用サイト_媒体」をサイトにつなぐ

使い方:  python3 scripts/link_drive.py            （同期フォルダを自動で探す）
        python3 scripts/link_drive.py <フォルダ>  （場所を指定する）

プロジェクト直下に `drive` というリンクを作り、同期フォルダを指すようにする。
サイトは `drive` が見つかればそこを、無ければ `media/` を読む（js/config.js の mediaBases）。
"""
import glob
import os
import sys

NAME = '出題用サイト_媒体'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LINK = os.path.join(ROOT, 'drive')


def find_synced():
    home = os.path.expanduser('~')
    patterns = [
        os.path.join(home, 'Library', 'CloudStorage', 'GoogleDrive-*', '*', NAME),          # macOS
        os.path.join(home, 'Library', 'CloudStorage', 'GoogleDrive-*', '*', '*', NAME),     # macOS（共有アイテム内など）
        os.path.join(home, 'Google Drive', '*', NAME),                                       # macOS ミラー（ファイルをミラーリング）
        os.path.join(home, 'Google Drive', '*', '*', NAME),
        os.path.join('G:\\', 'マイドライブ', NAME), os.path.join('G:\\', 'My Drive', NAME),   # Windows（ドライブ文字 G の場合）
    ]
    for p in patterns:
        hits = [h for h in glob.glob(p) if os.path.isdir(h) and '.Encrypted' not in h]
        if hits:
            return hits[0]
    return None


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else find_synced()
    if not target or not os.path.isdir(target):
        print('同期フォルダが見つかりません。Google Drive for desktop をインストールして「出題用サイト_媒体」を同期するか、')
        print('フォルダの場所を引数で指定してください:  python3 scripts/link_drive.py "<フォルダのパス>"')
        sys.exit(1)
    if os.path.islink(LINK) or os.path.exists(LINK):
        if os.path.islink(LINK):
            os.unlink(LINK)
        else:
            print(f'{LINK} が既にあり、リンクではありません。名前を変えてから再実行してください')
            sys.exit(1)
    os.symlink(target, LINK)
    rounds = sorted(d for d in os.listdir(target) if os.path.isdir(os.path.join(target, d)) and not d.startswith(('.', '_')))
    print(f'リンクを作りました: drive → {target}')
    print(f'回のフォルダ: {", ".join(rounds) if rounds else "（まだありません）"}')
    print('サーバーを起動（または再読み込み）すると、Drive の中身がそのまま表示されます')


if __name__ == '__main__':
    main()
