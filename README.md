# Jot

A library for writers who study model articles. Import an article (paste, `.txt`, `.md`), read it in a
calm two-column layout, underline, bold or highlight passages of any length, keep side notes beside them,
and write analysis memos that quote passages and jump back to them. Interface in 简体中文 and English.
Desktop (Windows, macOS) and web.

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

## Layout

| Path | Role |
|---|---|
| `packages/core` | Pure domain logic: ids, HLC, ops, search text, blocks, anchoring, tag graph |
| `packages/db` | SQLite schema, migrations, latest-edit-wins write path, search, tags, driver conformance suite |
| `packages/driver-web` | sqlite-wasm + OPFS worker driver (and an in-memory driver for tests) |
| `apps/client` | React UI shared by web and desktop |
| `apps/desktop` | Tauri 2 shell with native `rusqlite` commands |
