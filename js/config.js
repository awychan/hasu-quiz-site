/* サイトの設定（運営者が触るのはこのファイルだけ） */
window.QUIZ_CONFIG = {
  event: {
    short: 'QUIZ',
    title: 'Link！Like！ラブライブ！／蓮ノ空 クイズ大会',
  },
  // 回フォルダ（第1回、第2回 …）を探す場所。回フォルダが 1 つ以上見つかった最初の場所を使う（index.html からの相対パス）
  //   'drive' … Google Drive for desktop の「出題用サイト_媒体」へのリンク（python3 scripts/link_drive.py が作る）
  //   'media' … 手動でコピーしたフォルダ
  mediaBases: ['drive', 'media'],
  // 各回フォルダに置くファイル一覧の名前（scripts/make_list.py が作る。無ければサーバーのフォルダ一覧を使う）
  listFileName: '読み込み用ファイル.txt',
  // 一覧が取れないとき、第1回〜第N回 を順に探す上限
  maxRounds: 30,
  // 点数の階級表。1 番目・2 番目・3 番目の階級の点数
  //   減点方式：ヒント ①→②→③ がそのまま 1〜3 番目（①=5点、②=2点、③=1点。④ 以降は点数なし）
  //   点数方式：級の階級（下の levels）で決まる
  tierPoints: [5, 2, 1],
  // 級フォルダの名前 → 階級（1 = tierPoints の 1 番目）。上級=5点／中級=2点／初級=1点
  // 画面の並びは 初級 → 中級 → 上級（点数の低い順）
  levels: { 上級: 1, 中級: 2, 初級: 3 },
};
