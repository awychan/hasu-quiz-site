# hasu-quiz-site ─ 出題用サイト（Link！Like！ラブライブ！／蓮ノ空 クイズ大会）

Token discipline: follow /Users/awychan/Documents/Claude/Projects/CLAUDE_CODE_PLAYBOOK.md

## Stack
- Static site, no build step, no dependencies: `index.html`, `css/style.css`, `js/config.js` (event title, `mediaBases`, `tierPoints`, `levels`), `js/loader.js` (folder tree → rounds/genres/questions), `js/progress.js` (progress store, DOM-free), `js/app.js` (router + screens).
- Content is folder-driven, loader v3 (`feat/v3`): `<base>/<round>/<genre>/[<group>/][初級|中級|上級/][第N問|問題N[_方式]/]<files>`. Naming rules in `media/README.md`. Bases come from `config.mediaBases` (`drive` link first, then `media`; the first one that has a round folder wins). The loader reads `読み込み用ファイル.txt` per round (made by `scripts/make_list.py`, lists `folder/` lines too) or falls back to the server's directory listing.
- `QuizLoader.parse(round, files)` is pure (no fetch, runs in Node) and returns one question shape for every genre, so screens are chosen per question, not per genre (`genre.type` only drives the icon and sort order):
  `{key, mode, format, stages, answer, scoring, level, group, kind, label, warnings}`
  - `mode`: `staged` (hint stages) | `pair` (問題動画 + 正解動画) | `clips` (逆転: more stages than `tierPoints` and no answer file, or `_逆転` suffix)
  - `format`: hint medium `image|audio|video`, from the stage files' extension
  - `stages`: `[{n, src}]` for ①…⑳ (also `_verN`) in order, 1 to 20 of them
  - `answer`: `{image, audio, video, text}` from `_解答|回答|正解|答え` files; `text` = memo txt file name without `_` and `.txt`
  - `scoring`: `deduct` | `points` (precedence: question-folder suffix > level folder > genre suffix > guess)
  - `key`: `[group~][level~]id`, NFC-normalized, e.g. `1`, `サブジャンルA~1`, `サブジャンルA~初級~1`; stays the same when `問題1` is renamed `問題1_減点方式`. `genre.id` and round names are NFC too; only fetch URLs keep the original (maybe NFD) names.
- Points: `config.tierPoints` `[5, 2, 1]` is the one rank table. Hint stages ①②③ are ranks 1-3 (④ and later show no points); levels map to ranks via `config.levels` (上級 5 / 中級 2 / 初級 1). Tier colours follow the rank, not the point value: rank 1 `p3` (rosé), 2 `p2` (blue), 3 `p1` (yellow), 4th and later `p0` (neutral).
- Hash routing: `#/` round select, `#/<round>` TOP, `#/<round>/<genre.id>` genre screen, `#/<round>/<genre.id>/<key>` quiz. Components are URL-encoded.
- Progress in `localStorage` key `hasu-quiz-progress-v3`: `{ [round]: { [genre.id]: { [key]: { stages:{n:true}, answer, played, done } } } }`. The v2 key `hasu-quiz-progress-v2` is migrated once at startup in `js/progress.js` (clips/lyrics 3/2/1 → stages 1/2/3, hint n → stages 1..n+1, `qN` → `N`, `L<点>-<N>` → level question N; entries that cannot be migrated are dropped and listed in the load report).
- Script/style URLs carry `?v=YYYYMMDD` in `index.html`; bump it when shipping changes so browsers drop cached copies.
- Fixed 1440×810 stage scaled to the window (`#stage` transform). Fonts are self-hosted in the gitignored `fonts/` (`scripts/fetch_fonts.py`), Hiragino fallbacks if absent.

## Commands
- Run: `python3 scripts/serve.py 8765` (from a Terminal; also `.claude/launch.json` → `quiz-site`), open http://127.0.0.1:8765/. It is `http.server` plus threads, HTTP Range (video seeking, 100 MB+ answer videos) and `Cache-Control: no-cache`; options `[port] [-b ADDR] [-d DIR] [-q]`. Plain `python3 -m http.server` still works but video cannot seek. Check the port with `lsof -i :8765`.
- Tests: `node --test` (runs `tests/*.test.mjs`, dummy names only)
- Syntax check: `node --check js/app.js js/loader.js js/progress.js`
- Media check: `node scripts/check_media.mjs --base drive --round 第1回` (reads the folder like the site does); `--url http://127.0.0.1:8765 [--check-files]` goes through the server (`--check-files` GETs every assigned file once, which also warms Drive placeholders); `--offline-check` counts dataless Drive placeholders; `--expected tests/expected.第1回.json`; `--json out.json`. Exit 1 when files are unassigned. The output contains answers: never paste it into the repo or PRs.
- Generate list files: `python3 scripts/make_list.py` (optional; run it only on a local `media/` copy, never on `drive/` or any Drive path: it refuses, because it would write into the organizers' shared folder)
- Fonts: `python3 scripts/fetch_fonts.py` once while online (`--dry-run` to preview) → `fonts/` (gitignored)
- Drive link: `python3 scripts/link_drive.py` makes the `drive` symlink (stream and mirror paths)
- Local sample media for testing: generate a `media/第1回/…` tree with WAV/PNG/txt placeholders and dummy names (see git history of this session); `media/` is gitignored

## Conventions
- Design source of truth: the Design canvas https://claude.ai/artifact/UbYpUK1xJvynEuGL7VNZtm (D案 リンクラ・ライク) and the spec sheet 出題用サイト_画面項目仕様書 (Google Sheets, shared privately by the organizers; not linked here because the repo is public)
- Colors/type tokens live in `:root` of `css/style.css`; tier colours by rank `p3` / `p2` / `p1` / `p0` (see Stack); red `#BE1400` only for answer-reveal actions.
- UI copy is Japanese. No emoji as UI glyphs; inline stroke SVG icons in `app.js` `ICON`.
- Media are copyrighted: never commit `media/**` (gitignored); placeholder paths follow `media/README.md`.
- Never commit real media file names (song titles, video stems, `_<曲名>.txt` …): they are the quiz answers. This covers code, tests, docs, PLAN.md, commit messages and PRs. Tests and examples use dummy names; write placeholders like `_<曲名>.txt`. `tests/expected.*.json` (real-data pattern counts) and `fonts/` are gitignored too, as is the `drive` symlink.
- `drive` is a gitignored symlink to Google Drive for desktop's 「出題用サイト_媒体」 (shared by the organizers: read only, never write into it). Most files there are cloud placeholders that download on first read. A server started by the app preview sometimes cannot read it (404, cause unknown), so after starting any server verify with `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/drive/第1回/` (200 = readable) and start the server from a Terminal.
- Branch flow: feature branch → PR into `main` (the v3 integration branch was merged on 2026-10-09 and deleted). Do not stack PRs on top of each other: GitHub merges a stacked PR into its base branch, not `main`, unless the lower branch is deleted first. Bump `?v=` in `index.html` in every PR that touches `js/` or `css/`.
- Screens re-render from state (`rerender()`); the shared `Audio` object survives re-renders, the `<video>` element does not (video screen updates DOM in place via `syncVideoUI`).

## Phase plan
1. Done: Screens + progress store + media playback (2026-09-25)
2. Done: Folder-driven loading per spec シート5: round screen, loader, list generator (2026-10-01)
3. Done: Organizers filled the Drive folder (第1回, 2026-10-08); synced via `drive` symlink (Drive for desktop)
4. Done (2026-10-08, merged to `main` 2026-10-09 via PRs #1-#4): loader v3 + screens for the real folder structure (decisions and per-session tasks in PLAN.md); sessions 1-4 done, real-data QA in Chrome passed; remaining: visible-window playback check, `fetch_fonts.py` once online, re-run `check_media` after the organizers rename folders
5. 会場準備 (offline pinning, network-off rehearsal, backup `media/` copy; checklist in README) and open items: 逆転 rule, 級の点数 confirmation, night mode
