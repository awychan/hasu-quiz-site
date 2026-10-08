#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""出題用サイト用のローカル静的サーバー（python3 -m http.server の置き換え）。

使い方:
    python3 scripts/serve.py [port] [--bind 127.0.0.1] [--dir <フォルダ>] [-q]

    既定値: port=8765 / bind=127.0.0.1 / dir=このリポジトリのルート（scripts/ の一つ上）。
    どのフォルダから実行しても動く。標準ライブラリだけ（Python 3.9 以上、pip 不要）なので、
    ネットに繋がらない会場の PC でもそのまま使える。

なぜ http.server ではだめか:
  1. 動画のシーク ... 標準の http.server は HTTP Range に対応しない。<video> は
     「途中から読む」リクエストを送るので、シークや先頭へ戻る操作、100 MB を超える
     解答動画の再生開始が遅い・止まる・巻き戻せない。ここでは Range（206 / 416）に対応する。
  2. 並行接続 ... 動画を掴んだままのブラウザが他のリクエスト（画像・歌詞 txt・
     フォルダ一覧）を止めないよう、スレッド版サーバー（ThreadingHTTPServer、デーモン
     スレッド）で動かす。
  3. 差し替えたファイルのキャッシュ ... 全レスポンスに Cache-Control: no-cache を付け、
     運営が Drive 上で差し替えた媒体を、再読み込みのたびに必ず取り直す（ETag で
     変更なしなら 304 なので無駄な転送もしない）。

互換性:
  - フォルダ一覧（http.server の list_directory そのまま。「Directory listing for …」と
    <ul><a href="…"> の形）を js/loader.js が読むので、HTML の構造は変えていない。
  - シンボリックリンク（drive -> Google Drive for desktop）はそのまま辿る。
  - 拡張子の大文字小文字は無視（.PNG / .MP4 など）。.m4a / .webm / .txt（UTF-8）なども明示している。

制限:
  - 複数範囲（Range: bytes=0-9,20-29）には最初の（満たせる）範囲だけを 206 で返す。
    ブラウザの <video> / <audio> は単一範囲しか送らないので実害はない。
  - 読み取り専用の GET / HEAD のみ。認証・HTTPS・CGI はなし。公開用ではない
    （--bind 0.0.0.0 にする場合は信頼できる LAN だけで）。

アクセスログ: 1 リクエスト 1 行（時刻 メソッド パス ステータス 送信バイト 所要時間）。
-q / --quiet で消せる。停止は Ctrl+C。
"""

import argparse
import functools
import os
import re
import signal
import socket
import sys
import threading
import time
import urllib.parse
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DEFAULT_PORT = 8765
DEFAULT_BIND = "127.0.0.1"
REPO_ROOT = Path(__file__).resolve().parent.parent
CHUNK = 256 * 1024

# 接続を相手が切ったときは静かに捨てる（動画のシークでは日常的に起きる）
CLIENT_GONE = (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, socket.timeout)

# parse_range() が「どの範囲も満たせない」ときに返す目印（416 にする）
UNSATISFIABLE = object()

EXTRA_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".woff2": "font/woff2",
}

_print_lock = threading.Lock()


def parse_range(value, size):
    """Range ヘッダーを (start, end)（両端を含む）にする。

    戻り値:
      (start, end)   最初に満たせる範囲（複数範囲のときは最初の 1 つだけ採用）
      UNSATISFIABLE  文法は正しいが、どの範囲もファイルの外 -> 416
      None           bytes 以外の単位や文法エラー -> Range を無視して 200 で全体を返す
    """
    m = re.match(r"^\s*bytes\s*=\s*(.*)$", value, re.I)
    if not m:
        return None
    specs = [s.strip() for s in m.group(1).split(",") if s.strip()]
    if not specs:
        return None
    result = None
    for spec in specs:
        sm = re.fullmatch(r"([0-9]*)\s*-\s*([0-9]*)", spec, re.ASCII)
        if not sm or (sm.group(1) == "" and sm.group(2) == ""):
            return None
        first, last = sm.group(1), sm.group(2)
        if first == "":  # bytes=-N（末尾 N バイト）
            n = int(last)
            if n == 0 or size == 0:
                continue
            cand = (max(0, size - n), size - 1)
        else:  # bytes=a-b / bytes=a-
            start = int(first)
            if last != "":
                end = int(last)
                if end < start:
                    return None
            else:
                end = size - 1
            if start >= size:
                continue
            cand = (start, min(end, size - 1))
        if result is None:
            result = cand
    return result if result is not None else UNSATISFIABLE


def etag_matches(header, etag):
    header = header.strip()
    if header == "*":
        return True
    for tag in header.split(","):
        tag = tag.strip()
        if tag.startswith("W/"):
            tag = tag[2:]
        if tag == etag:
            return True
    return False


def human_size(n):
    if n < 1024:
        return "%dB" % n
    for unit in ("KB", "MB", "GB"):
        n /= 1024.0
        if n < 1024 or unit == "GB":
            return "%.1f%s" % (n, unit)


class QuizHandler(SimpleHTTPRequestHandler):
    # HTTP/1.1 にして接続を使い回す（動画のシークで何度もリクエストが飛ぶため）。
    # すべての応答に Content-Length を付けているので keep-alive でも詰まらない。
    protocol_version = "HTTP/1.1"
    server_version = "HasuQuizServe/1.0"
    quiet = False
    index_pages = ("index.html", "index.htm")

    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update(EXTRA_TYPES)

    # ---- 共通 ------------------------------------------------------------
    def end_headers(self):
        # send_error / 301 / 304 / 416 / 一覧を含むすべての応答に付く
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def parse_request(self):
        self._t0 = time.monotonic()
        self._code = None
        self._sent = 0
        return super().parse_request()

    def send_response(self, code, message=None):
        self._code = int(code)
        super().send_response(code, message)

    # 標準のログ（stderr、1 リクエストにつき数行）は使わず、_log_access で 1 行にする
    def log_request(self, code="-", size="-"):
        pass

    def log_message(self, format, *args):
        pass

    def log_error(self, format, *args):
        if self.quiet or str(format).startswith("code "):  # send_error 由来はアクセス行と重複
            return
        sys.stderr.write("[error] " + (format % args) + "\n")

    def _log_access(self):
        if self.quiet or self._code is None:
            return
        elapsed_ms = (time.monotonic() - self._t0) * 1000
        line = "%s %-4s %s %d %s %dms" % (
            time.strftime("%H:%M:%S"),
            self.command,
            urllib.parse.unquote(self.path, errors="replace"),
            self._code,
            human_size(self._sent) if self._sent else "-",
            elapsed_ms,
        )
        with _print_lock:
            try:
                sys.stdout.write(line + "\n")
                sys.stdout.flush()
            except (OSError, ValueError):
                pass

    # ---- GET / HEAD ------------------------------------------------------
    def do_GET(self):
        self._serve(head=False)

    def do_HEAD(self):
        self._serve(head=True)

    def _serve(self, head):
        body = None
        try:
            body = self._prepare()  # ヘッダーまで送り終えて (file, start, length) を返す。None なら本文なし
            if body is not None and not head:
                self._stream(*body)
        except CLIENT_GONE:
            self.close_connection = True
        finally:
            if body is not None:
                try:
                    body[0].close()
                except Exception:
                    pass
            self._log_access()

    def _prepare(self):
        path = self.translate_path(self.path)  # シンボリックリンクはそのまま辿る
        if os.path.isdir(path):
            if not urllib.parse.urlsplit(self.path).path.endswith("/"):
                super().send_head()  # 末尾 / への 301（標準の挙動）
                return None
            for name in self.index_pages:
                candidate = os.path.join(path, name)
                if os.path.isfile(candidate):
                    path = candidate
                    break
            else:
                # 標準の list_directory をそのまま使う（HTML の形は変えない）。
                # ヘッダー送信済みの BytesIO が返る。Cache-Control は end_headers が足す。
                listing = self.list_directory(path)
                return None if listing is None else (listing, 0, None)

        if path.endswith("/"):
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return None
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return None

        try:
            st = os.fstat(f.fileno())
            size = st.st_size
            etag = '"%x-%x"' % (size, st.st_mtime_ns)
            last_modified = self.date_time_string(st.st_mtime)
            ctype = self.guess_type(path)

            rng = None
            range_header = self.headers.get("Range")
            if range_header:
                if_range = self.headers.get("If-Range")
                if if_range is None or if_range.strip() in (etag, last_modified):
                    rng = parse_range(range_header, size)

            if rng is UNSATISFIABLE:
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header("Content-Range", "bytes */%d" % size)
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Length", "0")
                self.end_headers()
                f.close()
                return None

            if rng is None and not range_header:
                inm = self.headers.get("If-None-Match")
                if inm and etag_matches(inm, etag):
                    self.send_response(HTTPStatus.NOT_MODIFIED)
                    self.send_header("ETag", etag)
                    self.send_header("Last-Modified", last_modified)
                    self.send_header("Accept-Ranges", "bytes")
                    self.end_headers()
                    f.close()
                    return None

            if rng is None:
                self.send_response(HTTPStatus.OK)
                start, length = 0, size
            else:
                start, end = rng
                length = end - start + 1
                self.send_response(HTTPStatus.PARTIAL_CONTENT)
                self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
            self.send_header("Content-Type", ctype)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(length))
            self.send_header("Last-Modified", last_modified)
            self.send_header("ETag", etag)
            self.end_headers()
            return (f, start, length)
        except BaseException:
            f.close()
            raise

    def _stream(self, f, start, length):
        if start:
            f.seek(start)
        remaining = length  # None なら EOF まで（フォルダ一覧）
        while remaining is None or remaining > 0:
            n = CHUNK if remaining is None else min(CHUNK, remaining)
            chunk = f.read(n)
            if not chunk:
                break
            self.wfile.write(chunk)
            self._sent += len(chunk)
            if remaining is not None:
                remaining -= len(chunk)
        if remaining:  # 配信中にファイルが縮んだ -> Content-Length に足りないので接続を閉じる
            self.close_connection = True


class QuizServer(ThreadingHTTPServer):
    daemon_threads = True  # 動画接続を掴んだままでも Ctrl+C ですぐ止まる
    request_queue_size = 64

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, CLIENT_GONE):
            return
        super().handle_error(request, client_address)


class QuizServer6(QuizServer):
    address_family = socket.AF_INET6


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="出題用サイトのローカルサーバー（Range 対応・no-cache・スレッド版）。"
        "python3 -m http.server の置き換え。",
    )
    ap.add_argument("port", nargs="?", type=int, default=DEFAULT_PORT,
                    help="ポート番号（既定 %d）" % DEFAULT_PORT)
    ap.add_argument("-b", "--bind", default=DEFAULT_BIND, metavar="ADDR",
                    help="待ち受けアドレス（既定 %s）" % DEFAULT_BIND)
    ap.add_argument("-d", "--dir", default=str(REPO_ROOT), metavar="FOLDER",
                    help="配信するフォルダ（既定: リポジトリのルート %s）" % REPO_ROOT)
    ap.add_argument("-q", "--quiet", action="store_true", help="アクセスログを出さない")
    args = ap.parse_args(argv)

    root = os.path.abspath(os.path.expanduser(args.dir))
    if not os.path.isdir(root):
        ap.error("フォルダが見つかりません: %s" % root)
    if not (0 < args.port < 65536):
        ap.error("ポート番号は 1-65535: %d" % args.port)

    QuizHandler.quiet = args.quiet
    handler = functools.partial(QuizHandler, directory=root)

    server_cls = QuizServer6 if ":" in args.bind else QuizServer  # IPv6 アドレスのとき

    try:
        server = server_cls((args.bind, args.port), handler)
    except OSError as e:
        sys.stderr.write("起動できません（%s:%d）: %s\n" % (args.bind, args.port, e))
        sys.stderr.write("別のサーバーが同じポートを使っていないか確認してください。"
                         "別のポートで: python3 scripts/serve.py %d\n" % (args.port + 1))
        return 1

    try:
        sys.stdout.reconfigure(errors="backslashreplace")  # 文字コード設定が ASCII の端末でも落ちない
    except (AttributeError, ValueError):
        pass

    shown = args.bind if args.bind not in ("", "0.0.0.0", "::") else "127.0.0.1"
    if ":" in shown:
        shown = "[%s]" % shown
    print("出題用サイトを配信中: http://%s:%d/" % (shown, args.port))
    print("配信フォルダ: %s" % root)
    print("停止は Ctrl+C%s" % ("" if args.quiet else "（アクセスログは -q で消せます）"))
    sys.stdout.flush()

    signal.signal(signal.SIGTERM, lambda signum, frame: sys.exit(0))
    try:
        server.serve_forever(poll_interval=0.25)
    except (KeyboardInterrupt, SystemExit):
        print("\n停止しました。")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
