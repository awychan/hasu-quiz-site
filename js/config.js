/* サイトの設定（運営者が触るのはこのファイルだけ） */
window.QUIZ_CONFIG = {
  event: {
    short: 'QUIZ',
    title: 'Link！Like！ラブライブ！／蓮ノ空 クイズ大会',
  },
  // 回フォルダ（第1回、第2回 …）を置く場所。index.html からの相対パス
  // Google Drive の「出題用サイト_媒体」の中身をこのフォルダに同期（またはコピー）する
  mediaBase: 'media',
  // 各回フォルダに置くファイル一覧の名前（scripts/make_list.py が作る。無ければサーバーのフォルダ一覧を使う）
  listFileName: '読み込み用ファイル.txt',
  // 一覧が取れないとき、第1回〜第N回 を順に探す上限
  maxRounds: 30,
};
