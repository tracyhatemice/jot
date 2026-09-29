# Jot

A library for writers who study model articles. Import an article (paste, `.txt`, `.md`), read it
in a calm two-column layout, and fix import typos in place. Markups, notes and links find their words again.
Underline, bold or highlight passages of any length, and keep side notes beside them. Write analysis memos
that quote passages and jump back to them. Tag everything with tiered tags, and find it again by keyword,
tag and type. The interface is in 简体中文 and English. Desktop (Windows, macOS) and web.

Design: `docs/superpowers/specs/2026-09-27-jot-core-app-design.md` · Plans: `docs/superpowers/plans/`

## Development (Docker only)

Nothing is installed on the host; Node 24, pnpm, Rust and the Tauri toolchain live in the `dev` image.

```sh
scripts/bootstrap.sh                  # creates .env and node_modules mount points
docker compose build dev
docker compose run --rm dev pnpm install
docker compose up web                 # http://localhost:5173
docker compose run --rm dev pnpm test # also: pnpm typecheck, pnpm lint
docker compose up desktop             # Tauri window through WSLg
```

End-to-end tests (Chromium; WebKit is skipped, see Notes):

```sh
docker compose up -d web
docker compose --profile e2e up -d playwright
docker compose exec -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e
```

Rust tests: `docker compose run --rm dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'`

### Notes

- `.env` sets `COMPOSE_FILE=compose.yaml:compose.wslg.yaml` so the desktop window reaches WSLg
  through the distro's X socket (`X11_SOCKET_DIR`, default `/tmp/.X11-unix`). Docker Desktop cannot bind `/mnt/wslg`.
- WebKit e2e tests are skipped: Playwright's WebKit contexts have no OPFS. Safari OPFS is still unverified (open risk).
- When adding a workspace package, add its `node_modules` volume to `compose.yaml` **and** `scripts/bootstrap.sh`.
- `pnpm install` refuses to run outside the container (`scripts/require-container.mjs`).
- `?storage=memory` (dev server only) opens a throwaway in-memory library; the WebKit e2e project uses it.
- Check the desktop app from Docker: `docker compose exec -u node desktop node apps/desktop/scripts/screenshot.mjs Jot .screenshots/jot.png`.
- Exports and backups saved from the Docker desktop window go to the container's `~/Downloads`
  (`docker compose exec -u node desktop ls /home/node/Downloads`), not to the host.

## Working in Jot

- The sidebar has **Library**, **Memos** and **Tags** sections. Fold one with its arrow; click its heading for a page
  listing everything in it, with a **☰** menu on each row. **+** next to Library imports an article. Settings, Trash
  and the collapse arrow sit in the band at the bottom; collapsed, the sidebar keeps a narrow rail with Library,
  Memos and Tags one click away.
- The article and memo columns have a slim bar that hides while you scroll down. **Aa** sets the typeface, size,
  line spacing and line width (for articles and memos separately, on this device). **☰** holds Fix text, Edit
  details… and Delete for an article, and Move to article… and Delete for a memo.
- **Aa → Text styles** picks an English and a Chinese typeface (English ones are bundled; Chinese ones are your
  computer's), the font size, line spacing and line width. Selecting text in a memo shows a formatting bar.
- **+** next to Memos creates a memo that belongs to no article. A memo from another article shows a tinted tab.

## Your data

- In **Settings** (the gear at the bottom of the sidebar), **Export library** saves everything as one JSON file.
  **Import…** merges such a file into any library; where both have the same item, the newer edit wins.
  If the file holds items you have deleted since, Jot asks whether to bring them back.
- Deleting an article, memo or tag moves it to the **Trash** (the bin at the bottom of the sidebar). From there you can
  restore it, with everything deleted with it, or delete it forever, which erases its content from this device.
  Memos outlive their article: the sidebar's **Memos** list keeps every memo within reach.
- On desktop, **Back up database** saves a copy of the database file into your Downloads folder.
- Until sync arrives, the web version keeps the library only in this browser: export it now and then.

## Desktop builds

The `desktop` GitHub Actions workflow (run it by hand, or push a `v*` tag) builds Windows and macOS (Apple
silicon and Intel) installers and attaches them to the run as artifacts. Neither needs administrator rights:
- **Windows:** the `-setup.exe` installs Jot for your user account only.
- **macOS:** open the `.dmg` and drag Jot into Applications. On a standard (non-admin) account, use the
  Applications folder inside your home folder (`~/Applications`) instead.

They aren't signed with a developer certificate yet (the macOS app is only ad-hoc signed):
- **macOS:** the first time, macOS won't open Jot. Open **System Settings → Privacy & Security** and choose
  **Open Anyway** (on macOS 14 and earlier you can instead right-click Jot and choose **Open**). If macOS says
  Jot "is damaged", run `xattr -dr com.apple.quarantine /Applications/Jot.app` in Terminal (or the
  `~/Applications` path, if you put it there).
- **Windows:** if SmartScreen warns, choose **More info → Run anyway**.

## Layout

| Path | Role |
|---|---|
| `packages/core` | Pure domain logic: ids, HLC, ops, search text, blocks, anchoring, tag graph |
| `packages/db` | SQLite schema, migrations, latest-edit-wins write path, search, tags, driver conformance suite |
| `packages/driver-web` | sqlite-wasm + OPFS worker driver (and an in-memory driver for tests) |
| `apps/client` | React UI shared by web and desktop |
| `apps/desktop` | Tauri 2 shell with native `rusqlite` commands |
