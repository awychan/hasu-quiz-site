# hasu-quiz-site ─ 出題用サイト（Link！Like！ラブライブ！／蓮ノ空 クイズ大会）

Token discipline: follow /Users/awychan/Documents/Claude/Projects/CLAUDE_CODE_PLAYBOOK.md

## Stack
- Static site, no build step, no dependencies: `index.html`, `css/style.css`, `js/config.js` (event title, mediaBase), `js/loader.js` (folder tree → rounds/genres/questions), `js/app.js` (router + store + screens).
- Content is folder-driven, loader v3 (`feat/v3`): `<base>/<round>/<genre>/[<group>/][初級|中級|上級/][第N問|問題N[_方式]/]<files>`; stages `_①…⑳` / `_verN` (5/2/1 via `config.tierPoints`), answers `_解答|回答|正解|答え`, pairs `_問題`+`_正解`, note `_<答え>.txt` = answer text. `QuizLoader.parse(round, files)` is pure → one question shape `{key, mode: staged|pair|clips, format, stages, answer, points…}`. Naming rules in `media/README.md`. The loader reads `読み込み用ファイル.txt` per round (made by `scripts/make_list.py`, lists `folder/` lines too) or falls back to the server's directory listing; bases from `config.mediaBases` (`drive` link → `media`).
- Hash routing: `#/` round select, `#/<round>` TOP, `#/<round>/<genreFolder>` genre screen, `#/<round>/<genreFolder>/<key>` quiz. Keys: `q1` (audio/lyrics/image), `L2-1` (video: level points + id). Components are URL-encoded.
- Progress in `localStorage` key `hasu-quiz-progress-v2`: `{ [round]: { [genreFolder]: { [key]: { clips:{3,2,1}, lyrics:{3,2,1}, answer, played, hint, done } } } }`.
- Script/style URLs carry `?v=YYYYMMDD` in `index.html`; bump it when shipping changes so browsers drop cached copies.
- Fixed 1440×810 stage scaled to the window (`#stage` transform), fonts from Google Fonts with Hiragino fallbacks.

## Commands
- Run: `python3 -m http.server 8765 --bind 127.0.0.1` (also `.claude/launch.json` → `quiz-site`), open http://127.0.0.1:8765/
- Syntax check: `node --check js/app.js js/loader.js`
- Generate list files: `python3 scripts/make_list.py` (optional with the Python server; refuses to write into Drive)
- Loader tests: `node --test` (runs `tests/*.test.mjs`, dummy names only)
- Real-data check: `node scripts/check_media.mjs --base drive --round 第1回` or `--url http://127.0.0.1:8765` (output contains answers: never paste it into the repo/PRs; `tests/expected.*.json` is gitignored)
- Local sample media for testing: generate a `media/第1回/…` tree with WAV/PNG/txt placeholders (see git history of this session); `media/` is gitignored

## Conventions
- Design source of truth: the Design canvas https://claude.ai/artifact/UbYpUK1xJvynEuGL7VNZtm (D案 リンクラ・ライク) and the spec sheet 出題用サイト_画面項目仕様書 (Google Sheets, shared privately by the organizers; not linked here because the repo is public)
- Colors/type tokens live in `:root` of `css/style.css`; point tiers are `p3` (rosé) / `p2` (blue) / `p1` (yellow); red `#BE1400` only for answer-reveal actions.
- UI copy is Japanese. No emoji as UI glyphs; inline stroke SVG icons in `app.js` `ICON`.
- Media are copyrighted: never commit `media/**` (gitignored); placeholder paths follow `media/README.md`.
- Screens re-render from state (`rerender()`); the shared `Audio` object survives re-renders, the `<video>` element does not (video screen updates DOM in place via `syncVideoUI`).

## Phase plan
1. ✅ Screens + progress store + media playback (2026-09-25)
2. ✅ Folder-driven loading per spec シート5: round screen, loader, list generator (2026-10-01)
3. ✅ Organizers filled the Drive folder (第1回, 2026-10-08); synced via `drive` symlink (Drive for desktop)
4. Loader v3 + screens for the real folder structure (①②③ = 5/2/1, per-question format, nested sub-genres, video overlay fix) — sessions 1 → 2 → 3a → 3b → 4 in PLAN.md, decisions recorded there (2026-10-08)
5. 会場準備 (offline pinning, network-off rehearsal, backup copy) and open items: 逆転 rule, night mode
