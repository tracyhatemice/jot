# Jot Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested foundation of Jot:
- a Docker-only dev environment,
- the pure domain library (`@jot/core`),
- the SQLite data layer (`@jot/db`),
- four SQLite drivers that all pass one conformance suite,
- a diagnostics screen that proves the storage stack on web (browser storage, OPFS) and desktop (Tauri + native SQLite).

**Architecture:** A pnpm monorepo of TypeScript packages consumed as source, with no build step.
- `@jot/core` holds pure logic: IDs, the clock, ops, search text, article blocks, anchoring and the tag graph.
- `@jot/db` holds the schema, migrations, the latest-edit-wins write path, search and tags. It talks to SQLite only through a two-method `SqlDriver` interface.
- Four drivers implement that interface: `node:sqlite` for tests, sqlite-wasm in Node for tests, sqlite-wasm with OPFS for the web, and custom `rusqlite` commands for Tauri.
- Every tool runs inside Docker.

**Tech Stack:** Node 24, pnpm 10, TypeScript ~5.9, Vitest, fast-check, ESLint, React + Vite, `@sqlite.org/sqlite-wasm`, Tauri 2, Rust + `rusqlite` (bundled), Playwright 1.63.0, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-27-jot-core-app-design.md`. Read it before starting; this plan implements its §4, §5, §6.2–6.4, §7 and §8 foundations, plus milestones M0.1, M0.2, M1 and M2.

**Series:** Plan 1 of 4. Later plans (written after this one is built):
- Plan 2: M0.3/M0.4 risk checks, UI shell + translations, import, article view, markups, side notes.
- Plan 3: memos, tags UI, search UI.
- Plan 4: fix-up editing, .docx import, export, desktop builds in CI.

**Branch:** Work on `plan-1-foundation`. Create it with `git checkout -b plan-1-foundation`, or use a worktree via superpowers:using-git-worktrees.

## Global Constraints

- **Docker only.** Never install packages on the host, and never change host Node (v18). Every `pnpm`, `node`, `cargo` and `tsc` command runs as `docker compose run --rm dev <cmd>`, run from the repo root.
- **Node:** `>=24` (image `node:24-trixie`). **pnpm:** 10.x, installed in the image. **TypeScript:** `~5.9`; do not use TS 7 until the rest of the tooling is confirmed to work with it. **Rust:** stable, ≥ 1.90.
- Every SQLite driver must report `sqlite_version()` ≥ 3.43 and support FTS5 with `contentless_delete=1`.
- `SqlDriver` has exactly two methods: `query(sql, params)` and `batch(stmts)`. A batch runs as one transaction. There are no interactive transactions.
- **Text offsets are UTF-16 code units**, computed in TypeScript and never in SQL. Anchors must never split a surrogate pair (the two code units that make up an emoji or a rare CJK character).
- **Synced tables** have `id`, `hlc`, `fhlc` (JSON object of per-field clocks) and `deleted`, and no foreign keys. Field writes follow per-field latest-edit-wins, decided by comparing HLC strings.
- **HLC string format** is `MMMMMMMMMMMMMMM-CCCC-DDDDDDDDDDDDDDDD`: a 15-digit millisecond time, a 4-hex counter and a 16-hex device ID. Plain string order is causal order.
- `tag_edge.id = "e:<parent>:<child>"` and `tagging.id = "t:<tag>:<entityType>:<entityId>"`.
- **FTS queries** are built only by `buildFtsQuery`, which wraps every token in double quotes. Never interpolate user text into SQL.
- **Deviation from the spec:** migrations are TypeScript arrays of single SQL statements (`packages/db/src/migrations/*.ts`), not `.sql` files. Every driver runs one statement per call, so this avoids needing an SQL splitter.
- **Licenses:** only MIT, BSD or Apache dependencies. Never use TipTap Pro.
- **Commits:** conventional style (`feat:`, `test:`, `chore:`, `docs:`), with **no attribution or co-author lines**.

## Review Focus

These five inputs aren't covered by the spec's happy paths and are most likely to bite real users. Each one has a pinned test in the task that owns the code.

1. **Hostile or random search text** (quotes, `AND`/`NEAR(`/`-`/`:`/`*`/`^`, lone surrogates, emoji). Search must return results or `[]` and never throw an SQL error. Tested in Task 6 (query shape property) and Task 14 (random input against real FTS5).
2. **Characters outside the Basic Multilingual Plane** (emoji 😀, CJK Extension B 𠀀) in article text. A captured anchor's `exact`, `prefix` and `suffix` must never start or end in the middle of a surrogate pair. Tested in Task 8 (property test).
3. **Empty, whitespace-only or punctuation-only input.** Plain-text import returns `[]`, search returns `[]`, and a blank tag name is rejected with `InvalidTagNameError`. Tested in Tasks 7, 14 and 15.
4. **The device clock moving backwards** (the user changes system time), including across an app restart. New HLCs must still be strictly greater than earlier ones. Tested in Task 4 (Clock) and Task 13 (reopening a Library with `now = () => 0`).
5. **Very long articles.** A small fix-up edit to a ~170,000-character article must reattach anchors in under 1 second. Tested in Task 9.

---

## File Map

```
compose.yaml, compose.wslg.yaml, .env.example, .dockerignore, .gitignore      Task 1
docker/dev.Dockerfile, docker/entrypoint.sh, scripts/bootstrap.sh             Task 1
package.json, pnpm-workspace.yaml, .npmrc, tsconfig.base.json,               Task 2
vitest.config.ts, eslint.config.js, scripts/require-container.mjs,
scripts/typecheck.mjs
packages/core/                                                                Tasks 2–10
  src/entities.ts        EntityType list                                      Task 2
  src/sql.ts             SqlValue type                                        Task 3
  src/ids.ts             UUIDv7, device id, deterministic ids                 Task 3
  src/hlc.ts             Hybrid logical clock                                 Task 4
  src/util/base64.ts     bytes <-> base64                                     Task 5
  src/ops.ts             Op type, column whitelist, encode/decode             Task 5
  src/text-range.ts      TextRange type                                       Task 6
  src/search/text.ts     CJK normalizer, FTS query builder, highlights        Task 6
  src/article/blocks.ts  Block model, canonical text, plain-text import       Task 7
  src/anchoring/capture.ts   capture, block snapping, sentence range          Task 8
  src/anchoring/distance.ts  levenshtein, similarity                          Task 9
  src/anchoring/reanchor.ts  exact → mapped → fuzzy → orphan                  Task 9
  src/tags/graph.ts      DAG helpers, cycle breaking, merge planning          Task 10
  src/util/lock.ts       async mutex                                          Task 10
packages/db/                                                                  Tasks 11–15
  src/driver.ts          SqlDriver, Row, Stmt                                 Task 11
  src/conformance.ts     driver conformance cases (browser-safe)              Task 11
  testing/node-driver.ts node:sqlite driver (tests only)                      Task 11
  src/migrations/*.ts, src/migrate.ts                                         Task 12
  src/ops.ts             op → SQL (LWW upsert), outbox, kv                    Task 13
  src/library.ts         Library.open / commit                                Task 13
  src/search.ts          index/unindex statements, search()                   Task 14
  src/tags.ts            tag repository + repair                              Task 15
packages/driver-web/                                                          Task 16
  src/engine.ts, src/memory.ts, src/protocol.ts, src/worker.ts, src/index.ts
apps/client/                                                                  Tasks 17, 19
  src/platform/{index,tauri,wire}.ts, src/diagnostics/*, e2e/*
apps/desktop/                                                                 Task 18
  scripts/make-icon.mjs, src-tauri/{Cargo.toml,build.rs,tauri.conf.json,
  capabilities/default.json,src/{main,lib,db}.rs,icons/*}
.github/workflows/ci.yml, README.md                                           Task 20
```

---

### Task 1: Docker development environment

**Files:**
- Create: `docker/dev.Dockerfile`, `docker/entrypoint.sh`, `compose.yaml`, `compose.wslg.yaml`, `.env.example`, `.dockerignore`, `.gitignore`, `scripts/bootstrap.sh`

**Interfaces:**
- Produces:
  - the `dev` service, with repo at `/work`, running as the `node` user with the host UID/GID. Every later task runs commands through it.
  - the `web` service on `127.0.0.1:5173` (Task 17), the `desktop` service (Task 18) and the `playwright` service (Task 19).
  - named volumes for every `node_modules`, the pnpm store, the cargo registry and the cargo target directory.

- [ ] **Step 1: Write `docker/dev.Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
# Jot development image: Node 24 + pnpm + Rust + Tauri's Linux build dependencies.
FROM node:24-trixie

ARG UID=1000
ARG GID=1000

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev \
      libayatana-appindicator3-dev librsvg2-dev \
      fonts-noto-cjk fonts-noto-color-emoji sqlite3 gosu dbus x11-apps \
 && rm -rf /var/lib/apt/lists/*

# Give the image's `node` user the host UID/GID so files written into the bind mount stay host-owned.
RUN groupmod -o -g "$GID" node && usermod -o -u "$UID" -g "$GID" node

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    CARGO_TARGET_DIR=/cargo-target \
    PATH=/usr/local/cargo/bin:$PATH \
    npm_config_store_dir=/pnpm/store \
    IN_JOT_CONTAINER=1

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | sh -s -- -y --profile minimal --default-toolchain stable --no-modify-path \
 && rustup component add rustfmt clippy \
 && npm install -g pnpm@10 \
 && mkdir -p /pnpm/store /cargo-target \
 && chown -R node:node /pnpm /cargo-target "$CARGO_HOME" "$RUSTUP_HOME"

COPY docker/entrypoint.sh /usr/local/bin/jot-entrypoint
RUN chmod +x /usr/local/bin/jot-entrypoint
WORKDIR /work
ENTRYPOINT ["jot-entrypoint"]
CMD ["bash"]
```

- [ ] **Step 2: Write `docker/entrypoint.sh`**

```sh
#!/bin/sh
# Named volumes start out root-owned. Hand their mount roots to `node`, then drop privileges.
set -e
for dir in /pnpm/store /cargo-target /usr/local/cargo/registry \
           /work/node_modules /work/packages/*/node_modules /work/apps/*/node_modules; do
  if [ -d "$dir" ] && [ "$(stat -c %u "$dir")" != "$(id -u node)" ]; then
    chown node:node "$dir"
  fi
done
exec gosu node "$@"
```

- [ ] **Step 3: Write `compose.yaml`**

```yaml
name: jot

x-dev: &dev
  build:
    context: .
    dockerfile: docker/dev.Dockerfile
    args:
      UID: ${UID:-1000}
      GID: ${GID:-1000}
  image: jot-dev:latest
  working_dir: /work
  init: true
  environment:
    VITE_USE_POLLING: ${VITE_USE_POLLING:-false}
  volumes:
    - .:/work
    # When you add a workspace package, add its node_modules volume here AND in scripts/bootstrap.sh.
    - nm_root:/work/node_modules
    - nm_core:/work/packages/core/node_modules
    - nm_db:/work/packages/db/node_modules
    - nm_driver_web:/work/packages/driver-web/node_modules
    - nm_client:/work/apps/client/node_modules
    - nm_desktop:/work/apps/desktop/node_modules
    - pnpm_store:/pnpm/store
    - cargo_registry:/usr/local/cargo/registry
    - cargo_target:/cargo-target

services:
  dev:
    <<: *dev
    command: sleep infinity

  web:
    <<: *dev
    command: pnpm --filter @jot/client dev
    ports:
      - "127.0.0.1:5173:5173"

  desktop:
    <<: *dev
    profiles: [desktop]
    command: dbus-run-session -- pnpm --filter @jot/desktop tauri dev

  playwright:
    image: mcr.microsoft.com/playwright:v1.63.0-noble
    profiles: [e2e]
    init: true
    ipc: host
    user: pwuser
    # Share web's network namespace: the browser reaches the app at localhost:5173,
    # which is a secure origin (OPFS requires one) and passes Vite's host check.
    network_mode: service:web
    command: npx -y playwright@1.63.0 run-server --port 3000 --host 0.0.0.0

volumes:
  nm_root:
  nm_core:
  nm_db:
  nm_driver_web:
  nm_client:
  nm_desktop:
  pnpm_store:
  cargo_registry:
  cargo_target:
```

- [ ] **Step 4: Write `compose.wslg.yaml`** (display override for the Tauri window)

```yaml
# Shows the desktop container's windows on Windows through WSLg.
# Docker Desktop keeps the WSLg sockets at /run/desktop/mnt/host/wslg; plain Docker Engine inside WSL uses /mnt/wslg.
services:
  desktop:
    volumes:
      - ${WSLG_ROOT:-/run/desktop/mnt/host/wslg}/.X11-unix:/tmp/.X11-unix
      - ${WSLG_ROOT:-/run/desktop/mnt/host/wslg}:/mnt/wslg
    environment:
      DISPLAY: ":0"
      GDK_BACKEND: x11
      XDG_RUNTIME_DIR: /mnt/wslg/runtime-dir
      PULSE_SERVER: unix:/mnt/wslg/PulseServer
      WEBKIT_DISABLE_DMABUF_RENDERER: "1"
      WEBKIT_DISABLE_COMPOSITING_MODE: "1"
      NO_AT_BRIDGE: "1"
```

- [ ] **Step 5: Write `.env.example`, `.dockerignore`, `.gitignore` and `scripts/bootstrap.sh`**

`.env.example`:
```
UID=1000
GID=1000
COMPOSE_FILE=compose.yaml:compose.wslg.yaml
WSLG_ROOT=/run/desktop/mnt/host/wslg
VITE_USE_POLLING=false
```

`.dockerignore`:
```
**/node_modules
**/dist
.git
apps/desktop/src-tauri/target
```

`.gitignore`:
```
node_modules/
dist/
.env
*.log
.ownership-check
apps/desktop/src-tauri/target/
apps/desktop/src-tauri/gen/
test-results/
playwright-report/
```

`scripts/bootstrap.sh`:
```sh
#!/usr/bin/env sh
# Prepares the checkout for Docker: pre-creates node_modules mount points as the host user
# (Docker would otherwise create them owned by root) and seeds .env.
set -eu
cd "$(dirname "$0")/.."
for d in node_modules packages/core/node_modules packages/db/node_modules \
         packages/driver-web/node_modules apps/client/node_modules apps/desktop/node_modules; do
  mkdir -p "$d"
done
[ -f .env ] || cp .env.example .env
```

Run: `chmod +x scripts/bootstrap.sh docker/entrypoint.sh`

- [ ] **Step 6: Build the image and verify the toolchain**

Run: `scripts/bootstrap.sh && docker compose build dev`
Expected: the image builds without errors (the first build takes several minutes).

Run: `docker compose run --rm dev sh -c 'node --version && pnpm --version && rustc --version && cargo --version'`
Expected: `v24.*`, `10.*`, and `rustc 1.9x` or newer.

- [ ] **Step 7: Verify file ownership and the WSLg display**

Run: `docker compose run --rm dev touch /work/.ownership-check && stat -c '%U' .ownership-check && rm .ownership-check`
Expected: prints `ubuntu`, the host user, not `root`.

Run: `docker compose run --rm desktop xeyes`
Expected: an `xeyes` window appears on the Windows desktop. Close it to finish.
If no window appears, set `WSLG_ROOT=/mnt/wslg` in `.env` and retry. Record which root worked in the Task 1 commit message.

- [ ] **Step 8: Commit**

```bash
git add docker compose.yaml compose.wslg.yaml .env.example .dockerignore .gitignore scripts/bootstrap.sh
git commit -m "chore: add Docker dev environment with WSLg display override"
```

---

### Task 2: Workspace tooling and the `@jot/core` package

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.js`, `scripts/require-container.mjs`, `scripts/typecheck.mjs`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`, `packages/core/src/entities.ts`
- Test: `packages/core/src/entities.test.ts`

**Interfaces:**
- Produces:
  - Root scripts `pnpm test` (Vitest over all projects), `pnpm typecheck` and `pnpm lint`.
  - `@jot/core` exports `ENTITY_TYPES: readonly ['article','markup','side_note','memo']`, `type EntityType` and `isEntityType(v: string): v is EntityType`.
- Every later package copies this package's `package.json`, `tsconfig.json` and `vitest.config.ts` pattern.

- [ ] **Step 1: Write the root workspace files**

`package.json`:
```json
{
  "name": "jot",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@PNPM_VERSION",
  "engines": { "node": ">=24" },
  "scripts": {
    "preinstall": "node scripts/require-container.mjs",
    "test": "vitest run",
    "typecheck": "node scripts/typecheck.mjs",
    "lint": "eslint ."
  }
}
```

Replace the `PNPM_VERSION` placeholder with the pnpm version inside the image:
Run: `sed -i "s/PNPM_VERSION/$(docker compose run --rm -T dev pnpm --version | tr -d '\r')/" package.json && grep packageManager package.json`
Expected: `"packageManager": "pnpm@10.<minor>.<patch>",`

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
onlyBuiltDependencies:
  - esbuild
```

`.npmrc`:
```
engine-strict=true
```

`scripts/require-container.mjs`:
```js
// Installs must happen inside the dev container so the host environment stays untouched.
if (process.env.IN_JOT_CONTAINER !== '1') {
  console.error('Refusing to install on the host. Run: docker compose run --rm dev pnpm install');
  process.exit(1);
}
```

`scripts/typecheck.mjs`:
```js
// Type-checks every workspace package that has a tsconfig.json.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const dirs = ['packages', 'apps']
  .filter((root) => existsSync(root))
  .flatMap((root) => readdirSync(root).map((name) => `${root}/${name}`))
  .filter((dir) => existsSync(`${dir}/tsconfig.json`));

for (const dir of dirs) {
  console.log(`tsc -p ${dir}`);
  execFileSync('tsc', ['--noEmit', '-p', dir], { stdio: 'inherit' });
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "noFallthroughCasesInSwitch": true,
    "types": []
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts'],
  },
});
```

`eslint.config.js`:
```js
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    'apps/desktop/src-tauri/',
    '**/test-results/',
    '**/playwright-report/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly' } },
  },
]);
```

- [ ] **Step 2: Write the `@jot/core` package shell**

`packages/core/package.json`:
```json
{
  "name": "@jot/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/core/vitest.config.ts`:
```ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'core', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 3: Install root dev dependencies inside the container**

Run: `docker compose run --rm dev pnpm add -Dw typescript@~5.9 vitest eslint @eslint/js typescript-eslint @types/node`
Expected: `pnpm-lock.yaml` is created and the install succeeds.

Then check the host guard. The command must be refused:
Run: `docker compose run --rm -e IN_JOT_CONTAINER=0 dev pnpm install`
Expected: exits non-zero and prints `Refusing to install on the host.`

- [ ] **Step 4: Write the failing test**

`packages/core/src/entities.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ENTITY_TYPES, isEntityType } from './entities';

describe('entity types', () => {
  it('lists the four taggable, searchable kinds', () => {
    expect(ENTITY_TYPES).toEqual(['article', 'markup', 'side_note', 'memo']);
  });

  it('recognizes only those kinds', () => {
    expect(isEntityType('markup')).toBe(true);
    expect(isEntityType('tag')).toBe(false);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `docker compose run --rm dev pnpm test`
Expected: FAIL with `Failed to resolve import "./entities"`.

- [ ] **Step 6: Implement**

`packages/core/src/entities.ts`:
```ts
/** Kinds of library items that can carry tags and appear in search results. */
export const ENTITY_TYPES = ['article', 'markup', 'side_note', 'memo'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export function isEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}
```

`packages/core/src/index.ts`:
```ts
export * from './entities';
```

- [ ] **Step 7: Run tests, type check and lint**

Run: `docker compose run --rm dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: 2 tests pass, `tsc -p packages/core` reports no errors, and ESLint prints nothing.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json vitest.config.ts eslint.config.js scripts packages/core
git commit -m "chore: set up pnpm workspace, TypeScript, Vitest, ESLint and @jot/core"
```

---

### Task 3: IDs and the `SqlValue` type

**Files:**
- Create: `packages/core/src/sql.ts`, `packages/core/src/ids.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/ids.test.ts`

**Interfaces:**
- Consumes: `EntityType` (Task 2).
- Produces:
  - `type SqlValue = null | number | bigint | string | Uint8Array`
  - `newId(): string` — a UUIDv7
  - `newDeviceId(): string` — 16 lowercase hex characters
  - `tagEdgeId(parentId: string, childId: string): string`
  - `taggingId(tagId: string, entityType: EntityType, entityId: string): string`

- [ ] **Step 1: Add the dependency**

Run: `docker compose run --rm dev pnpm --filter @jot/core add uuid`

- [ ] **Step 2: Write the failing test**

`packages/core/src/ids.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { newDeviceId, newId, tagEdgeId, taggingId } from './ids';

describe('newId', () => {
  it('returns version-7 UUIDs', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('sorts in creation order', () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
  });
});

describe('newDeviceId', () => {
  it('is 16 random hex characters', () => {
    const id = newDeviceId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(newDeviceId()).not.toBe(id);
  });
});

describe('deterministic relationship ids', () => {
  it('encodes both ends so concurrent creations converge', () => {
    expect(tagEdgeId('p1', 'c1')).toBe('e:p1:c1');
    expect(taggingId('t1', 'markup', 'm1')).toBe('t:t1:markup:m1');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/ids.test.ts`
Expected: FAIL with `Failed to resolve import "./ids"`.

- [ ] **Step 4: Implement**

`packages/core/src/sql.ts`:
```ts
/** A value SQLite can store; blobs are Uint8Array. Shared by ops (core) and drivers (db). */
export type SqlValue = null | number | bigint | string | Uint8Array;
```

`packages/core/src/ids.ts`:
```ts
import { v7 as uuidv7 } from 'uuid';
import type { EntityType } from './entities';

/** Time-ordered UUIDv7 for every synced row. */
export function newId(): string {
  return uuidv7();
}

/** 16 lowercase hex chars; identifies this device inside HLC strings. */
export function newDeviceId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Deterministic ids: the same relationship created on two devices converges on one row. */
export function tagEdgeId(parentId: string, childId: string): string {
  return `e:${parentId}:${childId}`;
}

export function taggingId(tagId: string, entityType: EntityType, entityId: string): string {
  return `t:${tagId}:${entityType}:${entityId}`;
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './ids';
export * from './sql';
```

- [ ] **Step 5: Run it to verify it passes**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/ids.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "feat(core): add UUIDv7, device ids and deterministic relationship ids"
```

---

### Task 4: Hybrid logical clock

**Files:**
- Create: `packages/core/src/hlc.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/hlc.test.ts`

**Interfaces:**
- Produces:
  - `interface Hlc { ms: number; counter: number; node: string }`
  - `formatHlc(h: Hlc): string` and `parseHlc(s: string): Hlc`
  - `class Clock`, with constructor `(node: string, last: string | null = null, now: () => number = Date.now)`. Methods:
    - `tick(): string` — the stamp for a local event
    - `receive(remote: string): void` — merges a remote stamp
    - `last(): string`

- [ ] **Step 1: Add fast-check**

Run: `docker compose run --rm dev pnpm --filter @jot/core add -D fast-check`

- [ ] **Step 2: Write the failing test**

`packages/core/src/hlc.test.ts`:
```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Clock, formatHlc, parseHlc, type Hlc } from './hlc';

const NODE = 'a1b2c3d4e5f60718';

describe('HLC strings', () => {
  it('round-trips', () => {
    const h: Hlc = { ms: 1727430000123, counter: 42, node: NODE };
    expect(formatHlc(h)).toBe('001727430000123-002a-a1b2c3d4e5f60718');
    expect(parseHlc(formatHlc(h))).toEqual(h);
  });

  it('rejects malformed input', () => {
    expect(() => parseHlc('nope')).toThrow(/invalid HLC/);
    expect(() => formatHlc({ ms: 1, counter: 0, node: 'XYZ' })).toThrow(/node id/);
  });

  it('orders as strings exactly like (ms, counter, node) tuples', () => {
    const hlc = fc.record({
      ms: fc.integer({ min: 0, max: 2 ** 47 }),
      counter: fc.integer({ min: 0, max: 0xffff }),
      node: fc.constantFrom('0000000000000001', 'a1b2c3d4e5f60718', 'ffffffffffffffff'),
    });
    fc.assert(
      fc.property(hlc, hlc, (a, b) => {
        const tuple = Math.sign(a.ms - b.ms) || Math.sign(a.counter - b.counter) || (a.node < b.node ? -1 : a.node > b.node ? 1 : 0);
        const sa = formatHlc(a);
        const sb = formatHlc(b);
        const str = sa < sb ? -1 : sa > sb ? 1 : 0;
        expect(str).toBe(tuple);
      }),
    );
  });
});

describe('Clock', () => {
  it('uses wall time and bumps the counter within one millisecond', () => {
    const clock = new Clock(NODE, null, () => 1000);
    expect(clock.tick()).toBe(formatHlc({ ms: 1000, counter: 0, node: NODE }));
    expect(clock.tick()).toBe(formatHlc({ ms: 1000, counter: 1, node: NODE }));
  });

  it('stays monotonic when the wall clock goes backwards', () => {
    let wall = 5000;
    const clock = new Clock(NODE, null, () => wall);
    const first = clock.tick();
    wall = 10;
    const second = clock.tick();
    expect(second > first).toBe(true);
  });

  it('continues after a persisted stamp even if restarted with an earlier clock', () => {
    const last = formatHlc({ ms: 9_000_000, counter: 7, node: NODE });
    const clock = new Clock(NODE, last, () => 0);
    expect(clock.tick() > last).toBe(true);
  });

  it('moves past a received remote stamp', () => {
    const clock = new Clock(NODE, null, () => 1000);
    const remote = formatHlc({ ms: 50_000, counter: 3, node: 'ffffffffffffffff' });
    clock.receive(remote);
    expect(clock.tick() > remote).toBe(true);
  });

  it('rolls counter overflow into the millisecond field', () => {
    const clock = new Clock(NODE, formatHlc({ ms: 1000, counter: 0xffff, node: NODE }), () => 1000);
    expect(parseHlc(clock.tick())).toEqual({ ms: 1001, counter: 0, node: NODE });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/hlc.test.ts`
Expected: FAIL with `Failed to resolve import "./hlc"`.

- [ ] **Step 4: Implement**

`packages/core/src/hlc.ts`:
```ts
/**
 * Hybrid logical clock. Serialized as fixed-width `MMMMMMMMMMMMMMM-CCCC-DDDDDDDDDDDDDDDD`
 * (15-digit ms, 4-hex counter, 16-hex device id) so plain string comparison equals causal order.
 */
export interface Hlc {
  ms: number;
  counter: number;
  node: string;
}

const MAX_COUNTER = 0xffff;
const HLC_PATTERN = /^(\d{15})-([0-9a-f]{4})-([0-9a-f]{16})$/;

export function formatHlc(h: Hlc): string {
  if (!/^[0-9a-f]{16}$/.test(h.node)) throw new Error(`invalid HLC node id: ${h.node}`);
  if (h.counter < 0 || h.counter > MAX_COUNTER) throw new Error(`HLC counter out of range: ${h.counter}`);
  return `${String(h.ms).padStart(15, '0')}-${h.counter.toString(16).padStart(4, '0')}-${h.node}`;
}

export function parseHlc(value: string): Hlc {
  const match = HLC_PATTERN.exec(value);
  if (!match) throw new Error(`invalid HLC: ${value}`);
  return { ms: Number(match[1]), counter: parseInt(match[2], 16), node: match[3] };
}

export class Clock {
  private state: Hlc;

  constructor(
    node: string,
    last: string | null = null,
    private readonly now: () => number = Date.now,
  ) {
    this.state = last ? { ...parseHlc(last), node } : { ms: 0, counter: 0, node };
    formatHlc(this.state); // validates the node id early
  }

  /** Stamp for a local event: strictly greater than every stamp this clock has produced or received. */
  tick(): string {
    const wall = this.now();
    this.state =
      wall > this.state.ms
        ? { ms: wall, counter: 0, node: this.state.node }
        : this.bump(this.state.ms, this.state.counter + 1);
    return formatHlc(this.state);
  }

  /** Merges a stamp from another device so later local stamps sort after it. */
  receive(remote: string): void {
    const r = parseHlc(remote);
    const ms = Math.max(this.now(), this.state.ms, r.ms);
    let counter = 0;
    if (ms === this.state.ms && ms === r.ms) counter = Math.max(this.state.counter, r.counter) + 1;
    else if (ms === this.state.ms) counter = this.state.counter + 1;
    else if (ms === r.ms) counter = r.counter + 1;
    this.state = this.bump(ms, counter);
  }

  last(): string {
    return formatHlc(this.state);
  }

  private bump(ms: number, counter: number): Hlc {
    return counter > MAX_COUNTER ? { ms: ms + 1, counter: 0, node: this.state.node } : { ms, counter, node: this.state.node };
  }
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './hlc';
```

- [ ] **Step 5: Run it to verify it passes**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/hlc.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "feat(core): add hybrid logical clock with fixed-width sortable stamps"
```

---

### Task 5: Ops, column whitelist and base64

**Files:**
- Create: `packages/core/src/util/base64.ts`, `packages/core/src/ops.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/ops.test.ts`

**Interfaces:**
- Consumes: `SqlValue` (Task 3).
- Produces:
  - `bytesToBase64(bytes: Uint8Array): string` and `base64ToBytes(b64: string): Uint8Array`
  - `OP_VERSION = 1`
  - `SYNCED_COLUMNS: Record<SyncedTable, readonly string[]>` (exact contents below)
  - `type SyncedTable` — `'article' | 'article_revision' | 'anchor' | 'markup' | 'side_note' | 'memo' | 'memo_update' | 'tag' | 'tag_edge' | 'tagging'`
  - `IMMUTABLE_TABLES: ReadonlySet<SyncedTable>` — `article_revision` and `memo_update`
  - `interface Op { v: number; table: SyncedTable; id: string; hlc: string; fields: Record<string, SqlValue> }`
  - `assertValidOp(op: Op): void`
  - `encodeOp(op: Op): string` and `decodeOp(json: string): Op`. Blobs travel as `{ "$blob": "<base64>" }`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/ops.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { assertValidOp, decodeOp, encodeOp, IMMUTABLE_TABLES, OP_VERSION, SYNCED_COLUMNS, type Op } from './ops';
import { base64ToBytes, bytesToBase64 } from './util/base64';

const HLC = '001727430000123-0000-a1b2c3d4e5f60718';

describe('base64', () => {
  it('round-trips arbitrary bytes, including large buffers', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 31) % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    expect(bytesToBase64(new Uint8Array([0, 1, 254, 255]))).toBe('AAH+/w==');
  });
});

describe('ops', () => {
  it('round-trips through JSON, including blobs', () => {
    const op: Op = {
      v: OP_VERSION,
      table: 'memo_update',
      id: 'u1',
      hlc: HLC,
      fields: { memo_id: 'm1', data: new Uint8Array([1, 2, 3]), created_at: 1 },
    };
    const back = decodeOp(encodeOp(op));
    expect(back).toEqual(op);
    expect(back.fields.data).toBeInstanceOf(Uint8Array);
  });

  it('accepts whitelisted columns', () => {
    expect(() => assertValidOp({ v: 1, table: 'tag', id: 't', hlc: HLC, fields: { name: 'x', deleted: 0 } })).not.toThrow();
  });

  it('rejects columns outside the whitelist (SQL injection guard)', () => {
    expect(() =>
      assertValidOp({ v: 1, table: 'tag', id: 't', hlc: HLC, fields: { 'name" = 1; DROP TABLE tag; --': 'x' } }),
    ).toThrow(/not writable/);
    expect(() => assertValidOp({ v: 1, table: 'tag', id: 't', hlc: HLC, fields: { hlc: 'x' } })).toThrow(/not writable/);
  });

  it('rejects unknown tables', () => {
    expect(() => assertValidOp({ v: 1, table: 'nope' as never, id: 't', hlc: HLC, fields: {} })).toThrow(/unknown synced table/);
  });

  it('marks revisions and memo updates as immutable', () => {
    expect([...IMMUTABLE_TABLES].sort()).toEqual(['article_revision', 'memo_update']);
    expect(Object.keys(SYNCED_COLUMNS)).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/ops.test.ts`
Expected: FAIL with `Failed to resolve import "./ops"`.

- [ ] **Step 3: Implement**

`packages/core/src/util/base64.ts`:
```ts
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
```

`packages/core/src/ops.ts`:
```ts
import type { SqlValue } from './sql';
import { base64ToBytes, bytesToBase64 } from './util/base64';

/** Bumped whenever the op wire format changes (sync, sub-project 2). */
export const OP_VERSION = 1;

/**
 * Columns an op may write on each synced table, besides `id`, `hlc` and `fhlc`.
 * Also the SQL-injection guard: `opStatements` only interpolates names found here.
 */
export const SYNCED_COLUMNS = {
  article: ['title', 'author', 'source', 'lang', 'import_kind', 'current_revision_id', 'created_at', 'deleted'],
  article_revision: ['article_id', 'parent_id', 'blocks', 'text', 'created_at'],
  anchor: ['article_id', 'revision_id', 'start', 'end', 'exact', 'prefix', 'suffix', 'unit', 'created_at', 'deleted'],
  markup: ['article_id', 'anchor_id', 'kind', 'style', 'created_at', 'deleted'],
  side_note: ['markup_id', 'article_id', 'body', 'sort_key', 'created_at', 'deleted'],
  memo: ['title', 'home_article_id', 'created_at', 'deleted'],
  memo_update: ['memo_id', 'data', 'created_at'],
  tag: ['name', 'color', 'sort_key', 'created_at', 'deleted'],
  tag_edge: ['parent_id', 'child_id', 'deleted'],
  tagging: ['tag_id', 'entity_type', 'entity_id', 'article_id', 'created_at', 'deleted'],
} as const satisfies Record<string, readonly string[]>;

export type SyncedTable = keyof typeof SYNCED_COLUMNS;

/** Rows in these tables are written once and never change. */
export const IMMUTABLE_TABLES: ReadonlySet<SyncedTable> = new Set<SyncedTable>(['article_revision', 'memo_update']);

export interface Op {
  v: number;
  table: SyncedTable;
  id: string;
  hlc: string;
  fields: Record<string, SqlValue>;
}

export function assertValidOp(op: Op): void {
  const columns = (SYNCED_COLUMNS as Record<string, readonly string[] | undefined>)[op.table];
  if (!columns) throw new Error(`unknown synced table: ${op.table}`);
  for (const field of Object.keys(op.fields)) {
    if (!columns.includes(field)) throw new Error(`column "${field}" is not writable on ${op.table}`);
  }
}

export function encodeOp(op: Op): string {
  return JSON.stringify(op, (_key, value: unknown) => {
    if (value instanceof Uint8Array) return { $blob: bytesToBase64(value) };
    if (typeof value === 'bigint') throw new TypeError('bigint values cannot be stored in ops');
    return value;
  });
}

export function decodeOp(json: string): Op {
  return JSON.parse(json, (_key, value: unknown) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const blob = (value as { $blob?: unknown }).$blob;
      if (Object.keys(value).length === 1 && typeof blob === 'string') return base64ToBytes(blob);
    }
    return value;
  }) as Op;
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './ops';
export * from './util/base64';
```

- [ ] **Step 4: Run it to verify it passes**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/ops.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add op type, synced column whitelist and base64 codec"
```

---
### Task 6: Chinese/English search text: normalizer, FTS query builder, highlights

**Files:**
- Create: `packages/core/src/text-range.ts`, `packages/core/src/search/text.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/search/text.test.ts`

**Interfaces:**
- Produces:
  - `interface TextRange { start: number; end: number }` — UTF-16 offsets, end exclusive
  - `normalizeForIndex(s: string): string` — NFKC, plus a space around every Han, Hiragana and Katakana character
  - `type QueryTerm = { kind: 'cjk' | 'word'; text: string }` and `queryTerms(input: string): QueryTerm[]`
  - `buildFtsQuery(input: string): string | null`:
    - a CJK run becomes a phrase of single characters: `"比 喻"`
    - a word becomes a quoted prefix: `"writ"*`
    - terms are ANDed
    - returns `null` when nothing is searchable
  - `findHighlights(text: string, input: string): TextRange[]` — offsets into the original, unnormalized text; sorted and merged

- [ ] **Step 1: Write the failing test**

`packages/core/src/search/text.test.ts`:
```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildFtsQuery, findHighlights, normalizeForIndex, queryTerms } from './text';

describe('normalizeForIndex', () => {
  it('makes every CJK character its own token', () => {
    expect(normalizeForIndex('我爱写作')).toBe(' 我  爱  写  作 ');
    expect(normalizeForIndex('Hello世界')).toBe('Hello 世  界 ');
  });

  it('folds compatibility forms (full-width Latin) with NFKC', () => {
    expect(normalizeForIndex('ＡＢＣ')).toBe('ABC');
  });

  it('keeps astral CJK characters (Extension B) whole', () => {
    expect(normalizeForIndex('𠀀字')).toBe(' 𠀀  字 ');
  });
});

describe('queryTerms', () => {
  it('splits CJK runs from words', () => {
    expect(queryTerms('比喻 writing')).toEqual([
      { kind: 'cjk', text: '比喻' },
      { kind: 'word', text: 'writing' },
    ]);
    expect(queryTerms('AI写作')).toEqual([
      { kind: 'word', text: 'AI' },
      { kind: 'cjk', text: '写作' },
    ]);
  });
});

describe('buildFtsQuery', () => {
  it('builds single-character phrases for CJK and prefix queries for words', () => {
    expect(buildFtsQuery('比喻')).toBe('"比 喻"');
    expect(buildFtsQuery('喻')).toBe('"喻"');
    expect(buildFtsQuery('writ')).toBe('"writ"*');
    expect(buildFtsQuery('比喻 writ')).toBe('"比 喻" "writ"*');
  });

  it('neutralizes FTS syntax in user input', () => {
    expect(buildFtsQuery('"AND NEAR( -x:y ^z *')).toBe('"AND"* "NEAR"* "x"* "y"* "z"*');
  });

  it('returns null when nothing is searchable', () => {
    expect(buildFtsQuery('')).toBeNull();
    expect(buildFtsQuery('   ')).toBeNull();
    expect(buildFtsQuery('。，！')).toBeNull();
    expect(buildFtsQuery('\uD800')).toBeNull();
  });

  it('always produces a well-formed query for arbitrary input (Review Focus 1)', () => {
    const wellFormed = /^"(?:[^"]|"")*"\*?(?: "(?:[^"]|"")*"\*?)*$/;
    const hostile = fc.array(fc.constantFrom('"', '*', '(', ')', ':', '-', '^', 'AND', 'NEAR', ' ', 'a', '中', '😀', '\uD800', '\uDC00'), { maxLength: 30 }).map((a) => a.join(''));
    fc.assert(
      fc.property(fc.oneof(fc.string(), hostile), (input) => {
        const q = buildFtsQuery(input);
        if (q !== null) expect(q).toMatch(wellFormed);
      }),
    );
  });
});

describe('findHighlights', () => {
  it('finds CJK terms anywhere and word terms at word starts', () => {
    expect(findHighlights('他用了比喻。', '比喻')).toEqual([{ start: 3, end: 5 }]);
    expect(findHighlights('Rewrite writers', 'writ')).toEqual([{ start: 8, end: 12 }]);
  });

  it('ignores case and diacritics and maps back to original offsets', () => {
    expect(findHighlights('Café CAFE', 'cafe')).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 9 },
    ]);
  });

  it('merges overlapping hits', () => {
    expect(findHighlights('比喻', '比 比喻')).toEqual([{ start: 0, end: 2 }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/search/text.test.ts`
Expected: FAIL with `Failed to resolve import "./text"`.

- [ ] **Step 3: Implement**

`packages/core/src/text-range.ts`:
```ts
/** Half-open range of UTF-16 code-unit offsets: [start, end). */
export interface TextRange {
  start: number;
  end: number;
}
```

`packages/core/src/search/text.ts`:
```ts
import type { TextRange } from '../text-range';

const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const CJK_CHARS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
/** Mirrors FTS5 unicode61 token characters (categories L*, N*, Co). */
const WORD = /[\p{L}\p{N}\p{Co}]+/gu;

/**
 * Text as stored in the FTS index. unicode61 treats a run of Han characters as ONE token,
 * so we space them out: every CJK character becomes a token and phrase queries match substrings.
 */
export function normalizeForIndex(text: string): string {
  return text.normalize('NFKC').replace(CJK_CHARS, ' $& ');
}

export type QueryTerm = { kind: 'cjk'; text: string } | { kind: 'word'; text: string };

export function queryTerms(input: string): QueryTerm[] {
  const terms: QueryTerm[] = [];
  for (const chunk of input.normalize('NFKC').split(/\s+/)) {
    let buffer = '';
    let bufferIsCjk = false;
    const flush = () => {
      if (!buffer) return;
      if (bufferIsCjk) terms.push({ kind: 'cjk', text: buffer });
      else for (const word of buffer.match(WORD) ?? []) terms.push({ kind: 'word', text: word });
      buffer = '';
    };
    for (const ch of chunk) {
      const isCjk = CJK_CHAR.test(ch);
      if (buffer && isCjk !== bufferIsCjk) flush();
      bufferIsCjk = isCjk;
      buffer += ch;
    }
    flush();
  }
  return terms;
}

const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;

/** The only way user text reaches FTS5: every token is quoted, so operators in the input are inert. */
export function buildFtsQuery(input: string): string | null {
  const parts = queryTerms(input).map((term) =>
    term.kind === 'cjk' ? quote([...term.text].join(' ')) : `${quote(term.text)}*`,
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

function foldChar(ch: string): string {
  return ch.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Case- and diacritic-folded text plus, for each folded UTF-16 unit, its offset in the original. */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  let offset = 0;
  for (const ch of text) {
    const f = foldChar(ch);
    for (let k = 0; k < f.length; k++) map.push(offset);
    folded += f;
    offset += ch.length;
  }
  map.push(text.length);
  return { folded, map };
}

function mergeRanges(ranges: TextRange[]): TextRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: TextRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Ranges of `text` to highlight for a search `input`; used for snippets (FTS5 snippet() sees spaced text). */
export function findHighlights(text: string, input: string): TextRange[] {
  const { folded, map } = foldWithMap(text);
  const ranges: TextRange[] = [];
  for (const term of queryTerms(input)) {
    const needle = foldWithMap(term.text).folded;
    if (!needle) continue;
    for (let at = folded.indexOf(needle); at >= 0; at = folded.indexOf(needle, at + needle.length)) {
      const atWordStart = at === 0 || !/[\p{L}\p{N}]/u.test(folded[at - 1]);
      if (term.kind === 'cjk' || atWordStart) ranges.push({ start: map[at], end: map[at + needle.length] });
    }
  }
  return mergeRanges(ranges);
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './search/text';
export * from './text-range';
```

- [ ] **Step 4: Run it to verify it passes**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/search/text.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add CJK-aware search normalizer, FTS query builder and highlights"
```

---

### Task 7: Article block model and plain-text import

**Files:**
- Create: `packages/core/src/article/blocks.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/article/blocks.test.ts`

**Interfaces:**
- Consumes: `TextRange` (Task 6).
- Produces:
  - `type BlockKind = 'p' | 'h1' | 'h2' | 'h3' | 'quote' | 'li'`
  - `interface Run { t: string; b?: true; i?: true }`
  - `interface Block { k: BlockKind; runs: Run[] }`
  - `BLOCK_SEPARATOR = '\n\n'`
  - `blockText(block): string`, `canonicalText(blocks): string` and `blockRanges(blocks): TextRange[]`
  - `normalizeBlocks(blocks): Block[]`:
    - applies NFC
    - removes line breaks inside a block
    - merges adjacent runs that have the same marks
    - trims the block
    - drops empty runs and blocks
  - `plainTextToBlocks(text): Block[]`

- [ ] **Step 1: Write the failing test**

`packages/core/src/article/blocks.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { blockRanges, blockText, canonicalText, normalizeBlocks, plainTextToBlocks, type Block } from './blocks';

const texts = (blocks: Block[]) => blocks.map(blockText);

describe('plainTextToBlocks', () => {
  it('splits on blank lines and joins wrapped Latin lines with a space', () => {
    expect(texts(plainTextToBlocks('Para one\nstill one\n\nPara two'))).toEqual(['Para one still one', 'Para two']);
  });

  it('joins wrapped CJK lines without a space', () => {
    expect(texts(plainTextToBlocks('第一行\n第二行\n\n下一段'))).toEqual(['第一行第二行', '下一段']);
  });

  it('splits on single newlines when there are no blank lines, stripping full-width indents', () => {
    expect(texts(plainTextToBlocks('　　第一段。\n　　第二段。'))).toEqual(['第一段。', '第二段。']);
  });

  it('handles CRLF', () => {
    expect(texts(plainTextToBlocks('a\r\n\r\nb'))).toEqual(['a', 'b']);
  });

  it('returns no blocks for empty or whitespace-only input (Review Focus 3)', () => {
    expect(plainTextToBlocks('')).toEqual([]);
    expect(plainTextToBlocks(' \n　\n\t ')).toEqual([]);
  });

  it('produces paragraphs', () => {
    expect(plainTextToBlocks('x')).toEqual([{ k: 'p', runs: [{ t: 'x' }] }]);
  });
});

describe('normalizeBlocks', () => {
  it('applies NFC, merges runs with equal marks and drops empties', () => {
    const blocks: Block[] = [
      { k: 'p', runs: [{ t: ' é', b: true }, { t: 'x', b: true }, { t: '' }, { t: 'y ' }] },
      { k: 'p', runs: [{ t: '   ' }] },
    ];
    expect(normalizeBlocks(blocks)).toEqual([{ k: 'p', runs: [{ t: 'éx', b: true }, { t: 'y' }] }]);
  });
});

describe('canonical text', () => {
  it('joins blocks with a blank line and reports each block range', () => {
    const blocks = plainTextToBlocks('Hello\n\n世界\n\nEnd');
    const text = canonicalText(blocks);
    expect(text).toBe('Hello\n\n世界\n\nEnd');
    const ranges = blockRanges(blocks);
    expect(ranges).toEqual([
      { start: 0, end: 5 },
      { start: 7, end: 9 },
      { start: 11, end: 14 },
    ]);
    ranges.forEach((r, i) => expect(text.slice(r.start, r.end)).toBe(blockText(blocks[i])));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/article/blocks.test.ts`
Expected: FAIL with `Failed to resolve import "./blocks"`.

- [ ] **Step 3: Implement**

`packages/core/src/article/blocks.ts`:
```ts
import type { TextRange } from '../text-range';

export type BlockKind = 'p' | 'h1' | 'h2' | 'h3' | 'quote' | 'li';
/** A run of text with inline marks: b = bold, i = italic. */
export interface Run {
  t: string;
  b?: true;
  i?: true;
}
export interface Block {
  k: BlockKind;
  runs: Run[];
}

/** Separator between blocks in an article's canonical text; every anchor offset counts it. */
export const BLOCK_SEPARATOR = '\n\n';

/** Line breaks next to these characters are removed rather than turned into a space. */
const JOIN_WITHOUT_SPACE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}　-〿＀-￯]/u;

export function blockText(block: Block): string {
  return block.runs.map((r) => r.t).join('');
}

export function canonicalText(blocks: Block[]): string {
  return blocks.map(blockText).join(BLOCK_SEPARATOR);
}

export function blockRanges(blocks: Block[]): TextRange[] {
  const ranges: TextRange[] = [];
  let pos = 0;
  for (const block of blocks) {
    const length = blockText(block).length;
    ranges.push({ start: pos, end: pos + length });
    pos += length + BLOCK_SEPARATOR.length;
  }
  return ranges;
}

function collapseLineBreaks(s: string): string {
  return s.replace(/[ \t]*\r?\n[ \t　]*/g, (match: string, offset: number) => {
    const before = s[offset - 1] ?? '';
    const after = s[offset + match.length] ?? '';
    return JOIN_WITHOUT_SPACE.test(before) || JOIN_WITHOUT_SPACE.test(after) ? '' : ' ';
  });
}

function trimRuns(runs: Run[]): Run[] {
  const out = runs.map((r) => ({ ...r }));
  while (out.length > 0) {
    const first = out[0];
    first.t = first.t.trimStart();
    if (first.t) break;
    out.shift();
  }
  while (out.length > 0) {
    const last = out[out.length - 1];
    last.t = last.t.trimEnd();
    if (last.t) break;
    out.pop();
  }
  return out;
}

export function normalizeBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    const runs: Run[] = [];
    for (const run of block.runs) {
      const t = collapseLineBreaks(run.t.normalize('NFC'));
      if (!t) continue;
      const last = runs[runs.length - 1];
      if (last && last.b === run.b && last.i === run.i) last.t += t;
      else runs.push({ t, ...(run.b ? { b: true } : {}), ...(run.i ? { i: true } : {}) });
    }
    const trimmed = trimRuns(runs);
    if (trimmed.length > 0) out.push({ k: block.k, runs: trimmed });
  }
  return out;
}

/**
 * Plain text → paragraphs. With blank lines present, they separate paragraphs; without any
 * (common in Chinese text), every line is a paragraph. Full-width indents are stripped.
 */
export function plainTextToBlocks(text: string): Block[] {
  const src = text.replace(/\r\n?/g, '\n');
  const paragraphs = /\n[ \t　]*\n/.test(src) ? src.split(/\n(?:[ \t　]*\n)+/) : src.split('\n');
  return normalizeBlocks(paragraphs.map((p) => ({ k: 'p', runs: [{ t: p }] })));
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './article/blocks';
```

- [ ] **Step 4: Run it to verify it passes**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/article/blocks.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add article block model, canonical text and plain-text import"
```

---

### Task 8: Anchor capture, block snapping and sentence ranges

**Files:**
- Create: `packages/core/src/anchoring/capture.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/anchoring/capture.test.ts`

**Interfaces:**
- Consumes: `TextRange` (Task 6).
- Produces:
  - `CONTEXT_LENGTH = 32`
  - `type AnchorUnit = 'range' | 'block'`
  - `interface TextAnchor { start; end; exact; prefix; suffix; unit }`
  - `captureAnchor(text: string, start: number, end: number, unit?: AnchorUnit): TextAnchor`:
    - throws `RangeError` on an invalid range
    - never splits a surrogate pair
    - `start === end` makes a point anchor
  - `snapToBlocks(ranges: TextRange[], start: number, end: number): TextRange`
  - `sentenceRange(text: string, offset: number, locale?: string): TextRange`

- [ ] **Step 1: Write the failing test**

`packages/core/src/anchoring/capture.test.ts`:
```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CONTEXT_LENGTH, captureAnchor, sentenceRange, snapToBlocks } from './capture';

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe('captureAnchor', () => {
  it('records the quote and its context', () => {
    expect(captureAnchor('The quick brown fox', 4, 9)).toEqual({
      start: 4,
      end: 9,
      exact: 'quick',
      prefix: 'The ',
      suffix: ' brown fox',
      unit: 'range',
    });
  });

  it('limits context to 32 code units', () => {
    const text = 'x'.repeat(100) + 'TARGET' + 'y'.repeat(100);
    const a = captureAnchor(text, 100, 106);
    expect(a.prefix).toHaveLength(CONTEXT_LENGTH);
    expect(a.suffix).toHaveLength(CONTEXT_LENGTH);
  });

  it('supports point anchors', () => {
    const a = captureAnchor('Hello world', 5, 5);
    expect(a).toMatchObject({ start: 5, end: 5, exact: '', prefix: 'Hello', suffix: ' world' });
  });

  it('rejects invalid ranges', () => {
    expect(() => captureAnchor('abc', 2, 1)).toThrow(RangeError);
    expect(() => captureAnchor('abc', -1, 1)).toThrow(RangeError);
    expect(() => captureAnchor('abc', 0, 4)).toThrow(RangeError);
  });

  it('widens a selection that starts inside a surrogate pair', () => {
    expect(captureAnchor('a😀b', 2, 3)).toMatchObject({ start: 1, end: 3, exact: '😀' });
  });

  it('never leaves a lone surrogate in exact, prefix or suffix (Review Focus 2)', () => {
    const text = fc.array(fc.constantFrom('a', '中', '😀', '𠀀', ' ', '。'), { minLength: 1, maxLength: 80 }).map((a) => a.join(''));
    fc.assert(
      fc.property(text, fc.nat(), fc.nat(), (t, x, y) => {
        const start = x % (t.length + 1);
        const end = start + (y % (t.length - start + 1));
        const a = captureAnchor(t, start, end);
        for (const part of [a.exact, a.prefix, a.suffix]) expect(part).not.toMatch(LONE_SURROGATE);
        expect(t.slice(a.start, a.end)).toBe(a.exact);
      }),
    );
  });
});

describe('snapToBlocks', () => {
  const ranges = [
    { start: 0, end: 5 },
    { start: 7, end: 12 },
  ];

  it('expands to every block the selection touches', () => {
    expect(snapToBlocks(ranges, 2, 3)).toEqual({ start: 0, end: 5 });
    expect(snapToBlocks(ranges, 3, 9)).toEqual({ start: 0, end: 12 });
  });

  it('treats a point by the block that contains it', () => {
    expect(snapToBlocks(ranges, 7, 7)).toEqual({ start: 7, end: 12 });
  });

  it('does not grab the next block when the selection ends at its start', () => {
    expect(snapToBlocks(ranges, 2, 7)).toEqual({ start: 0, end: 5 });
  });
});

describe('sentenceRange', () => {
  it('finds the Chinese sentence around an offset', () => {
    expect(sentenceRange('他来了。她走了。', 5)).toEqual({ start: 4, end: 8 });
  });

  it('trims trailing whitespace from English sentences', () => {
    expect(sentenceRange('One. Two three.', 6)).toEqual({ start: 5, end: 15 });
    expect(sentenceRange('One. Two three.', 1)).toEqual({ start: 0, end: 4 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/anchoring/capture.test.ts`
Expected: FAIL with `Failed to resolve import "./capture"`.

- [ ] **Step 3: Implement**

`packages/core/src/anchoring/capture.ts`:
```ts
import type { TextRange } from '../text-range';

/** How much surrounding text an anchor remembers on each side, in UTF-16 code units. */
export const CONTEXT_LENGTH = 32;

export type AnchorUnit = 'range' | 'block';

export interface TextAnchor {
  start: number;
  end: number;
  exact: string;
  prefix: string;
  suffix: string;
  unit: AnchorUnit;
}

const isHighSurrogate = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLowSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** If `offset` falls between the two halves of a surrogate pair, move it one unit in `direction`. */
function snapOffset(text: string, offset: number, direction: -1 | 1): number {
  const inPair =
    offset > 0 &&
    offset < text.length &&
    isLowSurrogate(text.charCodeAt(offset)) &&
    isHighSurrogate(text.charCodeAt(offset - 1));
  return inPair ? offset + direction : offset;
}

export function captureAnchor(text: string, start: number, end: number, unit: AnchorUnit = 'range'): TextAnchor {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > text.length) {
    throw new RangeError(`invalid range ${start}..${end} for text of length ${text.length}`);
  }
  const s = snapOffset(text, start, -1);
  const e = start === end ? s : snapOffset(text, end, 1);
  const prefixStart = snapOffset(text, Math.max(0, s - CONTEXT_LENGTH), 1);
  const suffixEnd = snapOffset(text, Math.min(text.length, e + CONTEXT_LENGTH), -1);
  return {
    start: s,
    end: e,
    exact: text.slice(s, e),
    prefix: text.slice(prefixStart, s),
    suffix: text.slice(e, suffixEnd),
    unit,
  };
}

/** Expands [start, end) to cover every block it touches (paragraph markups). */
export function snapToBlocks(ranges: TextRange[], start: number, end: number): TextRange {
  const hit = ranges.filter((r) => (start === end ? r.start <= start && start <= r.end : r.start < end && start < r.end));
  if (hit.length === 0) return { start, end };
  return { start: hit[0].start, end: hit[hit.length - 1].end };
}

/** The sentence containing `offset`, without trailing whitespace ("line" markups). */
export function sentenceRange(text: string, offset: number, locale = 'zh'): TextRange {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
  for (const { index, segment } of segmenter.segment(text)) {
    if (offset >= index && offset < index + segment.length) {
      return { start: index, end: index + segment.trimEnd().length };
    }
  }
  return { start: offset, end: offset };
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './anchoring/capture';
```

- [ ] **Step 4: Run it to verify it passes**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/anchoring/capture.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add anchor capture, block snapping and sentence ranges"
```

---

### Task 9: Reattaching anchors after a fix-up edit

**Files:**
- Create: `packages/core/src/anchoring/distance.ts`, `packages/core/src/anchoring/reanchor.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/anchoring/reanchor.test.ts`

**Interfaces:**
- Consumes: `captureAnchor`, `CONTEXT_LENGTH` and `TextAnchor` (Task 8).
- Produces:
  - `levenshtein(a: string, b: string): number`
  - `similarity(a: string, b: string): number` — from 0 to 1
  - `type ResolutionStatus = 'exact' | 'mapped' | 'fuzzy' | 'orphan'`
  - `interface Resolution { status; start; end; score }`
  - `type StoredAnchor = Pick<TextAnchor, 'start' | 'end' | 'exact' | 'prefix' | 'suffix'>`
  - `reanchor(anchor: StoredAnchor, oldText: string, newText: string): Resolution`

- [ ] **Step 1: Add dependencies**

Run: `docker compose run --rm dev sh -c 'pnpm --filter @jot/core add approx-string-match diff-match-patch && pnpm --filter @jot/core add -D @types/diff-match-patch'`

- [ ] **Step 2: Write the failing test**

`packages/core/src/anchoring/reanchor.test.ts`:
```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { captureAnchor } from './capture';
import { levenshtein } from './distance';
import { reanchor } from './reanchor';

const anchorOn = (text: string, quote: string, occurrence = 0) => {
  let i = -1;
  for (let k = 0; k <= occurrence; k++) i = text.indexOf(quote, i + 1);
  if (i < 0) throw new Error(`"${quote}" not in text`);
  return captureAnchor(text, i, i + quote.length);
};

describe('levenshtein', () => {
  it('counts edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('比喻', '比喻')).toBe(0);
  });
});

describe('reanchor', () => {
  const old = 'The quick brown fox jumps over the lazy dog. The moon hung low over the harbour that night.';

  it('keeps an anchor whose text did not change', () => {
    const a = anchorOn(old, 'brown fox');
    expect(reanchor(a, old, old)).toEqual({ status: 'exact', start: a.start, end: a.end, score: 1 });
  });

  it('keeps offsets when the edit is far after the anchor', () => {
    const a = anchorOn(old, 'quick');
    const next = old.replace('night', 'evening');
    expect(reanchor(a, old, next)).toMatchObject({ status: 'exact', start: a.start });
  });

  it('maps offsets through an insertion before the anchor', () => {
    const a = anchorOn(old, 'brown fox');
    const next = 'Look! ' + old;
    const r = reanchor(a, old, next);
    expect(r).toMatchObject({ status: 'mapped', start: a.start + 6, end: a.end + 6 });
  });

  it('fuzzy-matches a long quote with a small correction inside it', () => {
    const a = anchorOn(old, 'The moon hung low over the harbour');
    const next = old.replace('harbour', 'harbor');
    const r = reanchor(a, old, next);
    expect(r.status).toBe('fuzzy');
    expect(next.slice(r.start, r.end)).toBe('The moon hung low over the harbor');
  });

  it('orphans an anchor whose text was deleted', () => {
    const a = anchorOn(old, 'The moon hung low over the harbour that night.');
    const next = 'The quick brown fox jumps over the lazy dog.';
    expect(reanchor(a, old, next).status).toBe('orphan');
  });

  it('does not re-attach a deleted short term to another occurrence with different context', () => {
    const filler = '中间有很多别的文字，'.repeat(6);
    const oldText = `A段：他用比喻写春天。${filler}B段：讨论比喻的作用。`;
    const a = anchorOn(oldText, '比喻', 0);
    const newText = `A段：${filler}B段：讨论比喻的作用。`;
    expect(reanchor(a, oldText, newText).status).toBe('orphan');
  });

  it('maps a point anchor through an insertion before it', () => {
    const text = 'Hello world. Second sentence.';
    const a = captureAnchor(text, 13, 13);
    const next = 'Intro. ' + text;
    expect(reanchor(a, text, next)).toMatchObject({ status: 'mapped', start: 20, end: 20 });
  });

  it('stays fast on a very long article (Review Focus 5)', () => {
    const text = Array.from({ length: 8000 }, (_, i) => `第${i}段：春风又绿江南岸，明月何时照我还。`).join('\n\n');
    const a = anchorOn(text, '第6000段：春风又绿江南岸');
    const cut = Math.floor(text.length / 3);
    const next = text.slice(0, cut) + '（补注）' + text.slice(cut);
    const t0 = performance.now();
    const r = reanchor(a, text, next);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(next.slice(r.start, r.end)).toBe(a.exact);
  });

  const alphabet = fc.constantFrom('a', 'b', ' ', '中', '文', '。', '😀');
  const textArb = fc.array(alphabet, { minLength: 10, maxLength: 120 }).map((a) => a.join(''));
  const insertArb = fc.array(alphabet, { minLength: 1, maxLength: 10 }).map((a) => a.join(''));
  const pickAnchor = (text: string, x: number, y: number) => {
    const start = x % text.length;
    return captureAnchor(text, start, start + 1 + (y % (text.length - start)));
  };

  it('property: an insertion at or after the anchor end keeps it at the same offsets', () => {
    fc.assert(
      fc.property(textArb, fc.nat(), fc.nat(), fc.nat(), insertArb, (text, x, y, z, insert) => {
        const a = pickAnchor(text, x, y);
        let p = a.end + (z % (text.length - a.end + 1));
        if (p < text.length && /[\uDC00-\uDFFF]/.test(text[p])) p -= 1; // stay on a code-point boundary
        fc.pre(p >= a.end);
        const next = text.slice(0, p) + insert + text.slice(p);
        const r = reanchor(a, text, next);
        expect(['exact', 'mapped']).toContain(r.status);
        expect(r.start).toBe(a.start);
        expect(next.slice(r.start, r.end)).toBe(a.exact);
      }),
    );
  });

  it('property: any edit yields an orphan or a spot resembling the quote (never a wrong spot)', () => {
    fc.assert(
      fc.property(textArb, fc.nat(), fc.nat(), fc.nat(), fc.nat(), insertArb, (text, x, y, s, l, insert) => {
        const a = pickAnchor(text, x, y);
        const from = s % text.length;
        const to = Math.min(text.length, from + (l % 20));
        const next = text.slice(0, from) + insert + text.slice(to);
        const r = reanchor(a, text, next);
        if (r.status !== 'orphan') {
          expect(levenshtein(next.slice(r.start, r.end), a.exact)).toBeLessThanOrEqual(Math.floor(a.exact.length * 0.25));
        }
      }),
    );
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/anchoring/reanchor.test.ts`
Expected: FAIL with `Failed to resolve import "./distance"`.

- [ ] **Step 4: Implement**

`packages/core/src/anchoring/distance.ts`:
```ts
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 for identical strings, 0 for nothing in common. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
}
```

`packages/core/src/anchoring/reanchor.ts`:
```ts
import search from 'approx-string-match';
import DiffMatchPatch from 'diff-match-patch';
import { CONTEXT_LENGTH, type TextAnchor } from './capture';
import { similarity } from './distance';

export type ResolutionStatus = 'exact' | 'mapped' | 'fuzzy' | 'orphan';

export interface Resolution {
  status: ResolutionStatus;
  start: number;
  end: number;
  score: number;
}

export type StoredAnchor = Pick<TextAnchor, 'start' | 'end' | 'exact' | 'prefix' | 'suffix'>;

/** A fuzzy quote match may differ from the stored quote in at most this share of characters. */
const MAX_ERROR_RATIO = 0.25;
/** Quotes shorter than this are too ambiguous to re-attach without matching context. */
const SHORT_QUOTE = 16;
const MIN_CONTEXT_SIMILARITY = 0.5;
/** Point anchors re-attach by their context; shorter context is too ambiguous. */
const MIN_POINT_CONTEXT = 4;

const dmp = new DiffMatchPatch();
dmp.Diff_Timeout = 2;

/**
 * Finds where an anchor captured on `oldText` belongs in `newText` (spec §6.2):
 * unchanged → diff-mapped → fuzzy quote search scored by context → orphan.
 */
export function reanchor(anchor: StoredAnchor, oldText: string, newText: string): Resolution {
  const { start, end, exact } = anchor;
  if (fitsAt(newText, anchor, start)) return { status: 'exact', start, end: start + exact.length, score: 1 };

  const diffs = dmp.diff_main(oldText, newText);
  const mappedStart = dmp.diff_xIndex(diffs, start);
  const mappedEnd = exact.length > 0 ? dmp.diff_xIndex(diffs, end - 1) + 1 : mappedStart;
  const mappedOk =
    exact.length > 0 ? newText.slice(mappedStart, mappedEnd) === exact : touchesContext(newText, anchor, mappedStart);
  if (mappedOk) return { status: 'mapped', start: mappedStart, end: mappedEnd, score: 1 };

  const fuzzy = exact.length > 0 ? fuzzyQuote(newText, anchor, mappedStart) : fuzzyPoint(newText, anchor);
  if (fuzzy) return fuzzy;

  const at = Math.min(start, newText.length);
  return { status: 'orphan', start: at, end: at, score: 0 };
}

/** Quote and both context strings are unchanged at `at`. */
function fitsAt(text: string, a: StoredAnchor, at: number): boolean {
  const end = at + a.exact.length;
  return (
    at - a.prefix.length >= 0 &&
    text.slice(at - a.prefix.length, at) === a.prefix &&
    text.slice(at, end) === a.exact &&
    text.slice(end, end + a.suffix.length) === a.suffix
  );
}

/** For point anchors: the context on at least one side is intact at `at`. */
function touchesContext(text: string, a: StoredAnchor, at: number): boolean {
  const before = a.prefix.length > 0 && at - a.prefix.length >= 0 && text.slice(at - a.prefix.length, at) === a.prefix;
  const after = a.suffix.length > 0 && text.slice(at, at + a.suffix.length) === a.suffix;
  return before || after;
}

function fuzzyQuote(text: string, a: StoredAnchor, hint: number): Resolution | null {
  const maxErrors = Math.floor(a.exact.length * MAX_ERROR_RATIO);
  let best: Resolution | null = null;
  let bestDistance = Infinity;
  for (const m of search(text, a.exact, maxErrors)) {
    const before = similarity(a.prefix, text.slice(Math.max(0, m.start - CONTEXT_LENGTH), m.start));
    const after = similarity(a.suffix, text.slice(m.end, m.end + CONTEXT_LENGTH));
    if (a.exact.length < SHORT_QUOTE && Math.max(before, after) < MIN_CONTEXT_SIMILARITY) continue;
    const quote = 1 - m.errors / a.exact.length;
    const distance = Math.abs(m.start - hint);
    const nearness = 1 - Math.min(1, distance / Math.max(text.length, 1));
    const score = (50 * quote + 20 * before + 20 * after + 2 * nearness) / 92;
    if (!best || score > best.score || (score === best.score && distance < bestDistance)) {
      best = { status: 'fuzzy', start: m.start, end: m.end, score };
      bestDistance = distance;
    }
  }
  return best;
}

function fuzzyPoint(text: string, a: StoredAnchor): Resolution | null {
  const locate = (pattern: string, atEnd: boolean): Resolution | null => {
    if (pattern.length < MIN_POINT_CONTEXT) return null;
    let best: { start: number; end: number; errors: number } | null = null;
    for (const m of search(text, pattern, Math.floor(pattern.length * MAX_ERROR_RATIO))) {
      if (!best || m.errors < best.errors) best = m;
    }
    if (!best) return null;
    const at = atEnd ? best.end : best.start;
    return { status: 'fuzzy', start: at, end: at, score: 1 - best.errors / pattern.length };
  };
  return locate(a.prefix, true) ?? locate(a.suffix, false);
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './anchoring/distance';
export * from './anchoring/reanchor';
```

- [ ] **Step 5: Run it to verify it passes**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/anchoring/reanchor.test.ts`
Expected: PASS (11 tests).
If the long-quote fuzzy test picks a boundary one character off (`...harbo` instead of `...harbor`), the problem is scoring, not the test. Break ties on `quote` before `distance`, and keep the test's expectation.

- [ ] **Step 6: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "feat(core): re-attach anchors after edits via diff mapping and fuzzy quote search"
```

---

### Task 10: Tag graph helpers and async lock

**Files:**
- Create: `packages/core/src/tags/graph.ts`, `packages/core/src/util/lock.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/tags/graph.test.ts`, `packages/core/src/util/lock.test.ts`

**Interfaces:**
- Produces:
  - `interface TagEdge { id: string; parent: string; child: string; hlc: string }`
  - `descendants(edges: Pick<TagEdge, 'parent' | 'child'>[], root: string): Set<string>` — includes `root` itself
  - `wouldCreateCycle(edges, parent: string, child: string): boolean`
  - `edgesToBreakCycles(edges: TagEdge[]): string[]` — the IDs of edges to delete. In each cycle it picks the edge with the highest HLC, breaking ties by the highest ID. The result is deterministic whatever order the input is in.
  - `foldTagName(name: string): string`
  - `planTagMerges(tags: { id: string; name: string }[]): { keep: string; drop: string[] }[]`
  - `interface Lock { run<T>(fn: () => Promise<T>): Promise<T> }` and `createLock(): Lock`

- [ ] **Step 1: Write the failing tests**

`packages/core/src/tags/graph.test.ts`:
```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { descendants, edgesToBreakCycles, foldTagName, planTagMerges, wouldCreateCycle, type TagEdge } from './graph';

const e = (parent: string, child: string, hlc = '1'): TagEdge => ({ id: `e:${parent}:${child}`, parent, child, hlc });

describe('descendants', () => {
  it('walks a DAG where a tag has several parents', () => {
    const edges = [e('技巧', '修辞'), e('修辞', '比喻'), e('意象', '比喻'), e('比喻', '明喻')];
    expect([...descendants(edges, '技巧')].sort()).toEqual(['修辞', '技巧', '明喻', '比喻'].sort());
    expect([...descendants(edges, '意象')].sort()).toEqual(['意象', '明喻', '比喻'].sort());
  });

  it('terminates on a cycle', () => {
    expect([...descendants([e('a', 'b'), e('b', 'a')], 'a')].sort()).toEqual(['a', 'b']);
  });
});

describe('wouldCreateCycle', () => {
  const edges = [e('a', 'b'), e('b', 'c')];
  it('detects self, direct and indirect cycles', () => {
    expect(wouldCreateCycle(edges, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(edges, 'b', 'a')).toBe(true);
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true);
  });
  it('allows a second parent', () => {
    expect(wouldCreateCycle(edges, 'x', 'c')).toBe(false);
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(false);
  });
});

describe('edgesToBreakCycles', () => {
  it('removes the newest edge of a two-cycle', () => {
    expect(edgesToBreakCycles([e('a', 'b', '1'), e('b', 'a', '2')])).toEqual(['e:b:a']);
  });

  it('removes one edge per independent cycle and nothing else', () => {
    const edges = [e('a', 'b', '5'), e('b', 'c', '1'), e('c', 'a', '2'), e('x', 'y', '1'), e('y', 'x', '9'), e('p', 'q', '9')];
    expect(edgesToBreakCycles(edges).sort()).toEqual(['e:a:b', 'e:y:x']);
  });

  it('returns nothing for an acyclic graph', () => {
    expect(edgesToBreakCycles([e('a', 'b'), e('a', 'c'), e('b', 'c')])).toEqual([]);
  });

  it('gives the same answer for any input order', () => {
    const edges = [e('a', 'b', '3'), e('b', 'c', '1'), e('c', 'a', '2'), e('c', 'd', '4'), e('d', 'b', '5')];
    const expected = edgesToBreakCycles(edges).sort();
    fc.assert(
      fc.property(fc.shuffledSubarray(edges, { minLength: edges.length, maxLength: edges.length }), (shuffled) => {
        expect(edgesToBreakCycles(shuffled).sort()).toEqual(expected);
      }),
    );
  });
});

describe('tag names', () => {
  it('folds width, case and surrounding space', () => {
    expect(foldTagName('  Metaphor ')).toBe('metaphor');
    expect(foldTagName('ＭＥＴＡ　phor')).toBe('meta phor');
  });

  it('plans merges into the smallest id', () => {
    const plan = planTagMerges([
      { id: 'b', name: '比喻' },
      { id: 'a', name: ' 比喻 ' },
      { id: 'c', name: 'Metaphor' },
      { id: 'd', name: 'metaphor' },
      { id: 'e', name: 'unique' },
    ]);
    expect(plan).toEqual([
      { keep: 'a', drop: ['b'] },
      { keep: 'c', drop: ['d'] },
    ]);
  });
});
```

`packages/core/src/util/lock.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createLock } from './lock';

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('createLock', () => {
  it('runs critical sections one at a time in call order', async () => {
    const lock = createLock();
    const log: string[] = [];
    await Promise.all([
      lock.run(async () => {
        log.push('a:start');
        await tick();
        log.push('a:end');
      }),
      lock.run(async () => {
        log.push('b:start');
        log.push('b:end');
      }),
    ]);
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('keeps working after a section throws', async () => {
    const lock = createLock();
    await expect(lock.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(lock.run(async () => 42)).resolves.toBe(42);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/tags packages/core/src/util/lock.test.ts`
Expected: FAIL with `Failed to resolve import "./graph"` and `"./lock"`.

- [ ] **Step 3: Implement**

`packages/core/src/util/lock.ts`:
```ts
export interface Lock {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

/** Async mutex: sections run one after another, in call order, even if one throws. */
export function createLock(): Lock {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const result = tail.then(() => fn());
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
```

`packages/core/src/tags/graph.ts`:
```ts
export interface TagEdge {
  id: string;
  parent: string;
  child: string;
  hlc: string;
}

type Link = Pick<TagEdge, 'parent' | 'child'>;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** `root` and every tag below it. Safe on graphs that (temporarily) contain cycles. */
export function descendants(edges: Link[], root: string): Set<string> {
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length > 0) {
    const node = queue.shift() as string;
    for (const e of edges) {
      if (e.parent === node && !seen.has(e.child)) {
        seen.add(e.child);
        queue.push(e.child);
      }
    }
  }
  return seen;
}

export function wouldCreateCycle(edges: Link[], parent: string, child: string): boolean {
  return parent === child || descendants(edges, child).has(parent);
}

/** Deterministic DFS: nodes and out-edges visited in id order, so every device finds the same cycle. */
function findCycle(edges: TagEdge[]): TagEdge[] | null {
  const out = new Map<string, TagEdge[]>();
  for (const e of edges) {
    const list = out.get(e.parent) ?? [];
    list.push(e);
    out.set(e.parent, list);
  }
  for (const list of out.values()) list.sort((a, b) => cmp(a.child, b.child) || cmp(a.id, b.id));
  const nodes = [...new Set(edges.flatMap((e) => [e.parent, e.child]))].sort(cmp);
  const state = new Map<string, 'active' | 'done'>();
  const path: TagEdge[] = [];

  const visit = (node: string): TagEdge[] | null => {
    state.set(node, 'active');
    for (const e of out.get(node) ?? []) {
      const s = state.get(e.child);
      if (s === 'active') {
        const i = path.findIndex((p) => p.parent === e.child);
        return i < 0 ? [e] : [...path.slice(i), e];
      }
      if (s === undefined) {
        path.push(e);
        const cycle = visit(e.child);
        if (cycle) return cycle;
        path.pop();
      }
    }
    state.set(node, 'done');
    return null;
  };

  for (const n of nodes) {
    if (!state.has(n)) {
      const cycle = visit(n);
      if (cycle) return cycle;
    }
  }
  return null;
}

/**
 * Edges to delete so the graph becomes acyclic again after a sync merged edges from two devices.
 * In each cycle the newest edge (highest HLC, then highest id) loses.
 */
export function edgesToBreakCycles(edges: TagEdge[]): string[] {
  let live = [...edges];
  const removed: string[] = [];
  for (let cycle = findCycle(live); cycle; cycle = findCycle(live)) {
    const victim = cycle.reduce((a, b) => (cmp(b.hlc, a.hlc) > 0 || (b.hlc === a.hlc && cmp(b.id, a.id) > 0) ? b : a));
    removed.push(victim.id);
    live = live.filter((e) => e.id !== victim.id);
  }
  return removed;
}

export function foldTagName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Tags whose folded names collide are merged into the one with the smallest id. */
export function planTagMerges(tags: { id: string; name: string }[]): { keep: string; drop: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const t of tags) {
    const key = foldTagName(t.name);
    groups.set(key, [...(groups.get(key) ?? []), t.id]);
  }
  return [...groups.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => ids.sort(cmp))
    .map(([keep, ...drop]) => ({ keep, drop }))
    .sort((a, b) => cmp(a.keep, b.keep));
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './tags/graph';
export * from './util/lock';
```

- [ ] **Step 4: Run them to verify they pass**

Run: `docker compose run --rm dev pnpm vitest run packages/core/src/tags packages/core/src/util/lock.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Run the whole core suite, type check and lint**

Run: `docker compose run --rm dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes, with no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add tag DAG helpers, deterministic cycle breaking and async lock"
```

---
### Task 11: `@jot/db`: driver interface, node:sqlite test driver and conformance suite

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/vitest.config.ts`, `packages/db/src/index.ts`, `packages/db/src/driver.ts`, `packages/db/src/conformance.ts`, `packages/db/testing/node-driver.ts`
- Test: `packages/db/src/conformance.test.ts`

**Interfaces:**
- Consumes: `SqlValue`, `buildFtsQuery` and `normalizeForIndex` from `@jot/core`.
- Produces:
  - `type Row = Record<string, SqlValue>` and `interface Stmt { sql: string; params?: SqlValue[] }`
  - `interface SqlDriver { query<T = Row>(sql: string, params?: SqlValue[]): Promise<T[]>; batch(stmts: Stmt[]): Promise<void> }`
  - `@jot/db/conformance` exports `interface ConformanceCase { name: string; run(driver: SqlDriver): Promise<void> }` and `conformanceCases: ConformanceCase[]`. A case throws an `Error` whose message explains any failure. It is safe in the browser and uses only `temp.` tables.
  - `@jot/db/testing/node` exports `createNodeDriver(filename?: string): SqlDriver` (Node only).

- [ ] **Step 1: Create the package shell and add dependencies**

`packages/db/package.json`:
```json
{
  "name": "@jot/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./conformance": "./src/conformance.ts",
    "./testing/node": "./testing/node-driver.ts"
  }
}
```

`packages/db/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "testing"]
}
```

`packages/db/vitest.config.ts`:
```ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'db', include: ['src/**/*.test.ts'] },
});
```

Run: `docker compose run --rm dev sh -c 'pnpm --filter @jot/db add "@jot/core@workspace:*" fractional-indexing && pnpm --filter @jot/db add -D fast-check @types/node'`

- [ ] **Step 2: Write the driver interface**

`packages/db/src/driver.ts`:
```ts
import type { SqlValue } from '@jot/core';

export type { SqlValue };
export type Row = Record<string, SqlValue>;

export interface Stmt {
  sql: string;
  params?: SqlValue[];
}

/**
 * The only way Jot talks to SQLite. Drivers sit behind a message boundary (Tauri IPC, a Web Worker),
 * so there are no interactive transactions: read-then-write sequences use `Library.lock` instead.
 */
export interface SqlDriver {
  /** Runs one statement and returns its rows as objects keyed by column name. */
  query<T = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Runs statements in one transaction; if any fails, none take effect. */
  batch(stmts: Stmt[]): Promise<void>;
}
```

`packages/db/src/index.ts`:
```ts
export * from './driver';
```

- [ ] **Step 3: Write the failing test**

`packages/db/src/conformance.test.ts`:
```ts
import { describe, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { conformanceCases } from './conformance';

describe('node:sqlite driver conformance', () => {
  for (const c of conformanceCases) {
    it(c.name, () => c.run(createNodeDriver()));
  }
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `docker compose run --rm dev pnpm vitest run packages/db/src/conformance.test.ts`
Expected: FAIL with `Failed to resolve import "../testing/node-driver"`.

- [ ] **Step 5: Implement the node driver and the conformance cases**

`packages/db/testing/node-driver.ts`:
```ts
import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver, SqlValue, Stmt } from '../src/driver';

/** Test driver backed by Node's built-in SQLite (compiled with FTS5 in official Node builds). */
export function createNodeDriver(filename = ':memory:'): SqlDriver {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON');
  const run = (sql: string, params: SqlValue[] = []) => db.prepare(sql).all(...params).map((row) => ({ ...row }));
  return {
    async query<T>(sql: string, params?: SqlValue[]) {
      return run(sql, params) as T[];
    },
    async batch(stmts: Stmt[]) {
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const s of stmts) run(s.sql, s.params);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
```

`packages/db/src/conformance.ts`:
```ts
import { buildFtsQuery, normalizeForIndex } from '@jot/core';
import type { SqlDriver } from './driver';

/**
 * Behaviour every SqlDriver must have. Runs in Vitest (Node drivers) and on the diagnostics
 * screen (OPFS and Tauri drivers). Uses only temp tables so it never touches library data.
 */
export interface ConformanceCase {
  name: string;
  run(driver: SqlDriver): Promise<void>;
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const FTS_ROWS: [number, string][] = [
  [1, '他用比喻写春天。'],
  [2, 'Writers love a good metaphor. Café culture.'],
  [3, '比方说，喻体不同。'],
];

async function createFts(driver: SqlDriver): Promise<(input: string) => Promise<number[]>> {
  await driver.batch([
    { sql: 'DROP TABLE IF EXISTS temp.conf_fts' },
    {
      sql: "CREATE VIRTUAL TABLE temp.conf_fts USING fts5(body, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2')",
    },
    ...FTS_ROWS.map(([rowid, body]) => ({
      sql: 'INSERT INTO temp.conf_fts (rowid, body) VALUES (?, ?)',
      params: [rowid, normalizeForIndex(body)],
    })),
  ]);
  return async (input) => {
    const query = buildFtsQuery(input);
    if (query === null) return [];
    const rows = await driver.query<{ rowid: number }>(
      'SELECT rowid FROM temp.conf_fts WHERE conf_fts MATCH ? ORDER BY rowid',
      [query],
    );
    return rows.map((r) => Number(r.rowid));
  };
}

const dropFts = (driver: SqlDriver) => driver.batch([{ sql: 'DROP TABLE IF EXISTS temp.conf_fts' }]);
const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export const conformanceCases: ConformanceCase[] = [
  {
    name: 'SQLite is 3.43 or newer',
    async run(d) {
      const [row] = await d.query<{ v: string }>('SELECT sqlite_version() AS v');
      const [major, minor] = row.v.split('.').map(Number);
      check(major > 3 || (major === 3 && minor >= 43), `SQLite ${row.v} is older than 3.43`);
    },
  },
  {
    name: 'binds and returns null, integer, real, text and blob',
    async run(d) {
      const blob = new Uint8Array([0, 1, 254, 255]);
      const [r] = await d.query<{ n: null; i: number; f: number; t: string; b: Uint8Array }>(
        'SELECT ? AS n, ? AS i, ? AS f, ? AS t, ? AS b',
        [null, 1727430000123, 1.5, '中文 text 😀', blob],
      );
      check(r.n === null, `null came back as ${String(r.n)}`);
      check(r.i === 1727430000123, `integer came back as ${String(r.i)} (${typeof r.i})`);
      check(r.f === 1.5, `real came back as ${String(r.f)}`);
      check(r.t === '中文 text 😀', `text came back as ${String(r.t)}`);
      check(r.b instanceof Uint8Array && [...r.b].join() === '0,1,254,255', `blob came back as ${String(r.b)}`);
    },
  },
  {
    name: 'invalid SQL rejects instead of throwing synchronously',
    async run(d) {
      let rejected = false;
      await d.query('SELEC 1').catch(() => {
        rejected = true;
      });
      check(rejected, 'invalid SQL did not reject');
    },
  },
  {
    name: 'batch rolls back entirely when a statement fails',
    async run(d) {
      await d.batch([
        { sql: 'DROP TABLE IF EXISTS temp.conf_atomic' },
        { sql: 'CREATE TEMP TABLE conf_atomic (x INTEGER PRIMARY KEY)' },
      ]);
      let failed = false;
      try {
        await d.batch([
          { sql: 'INSERT INTO temp.conf_atomic VALUES (1)' },
          { sql: 'INSERT INTO temp.conf_atomic VALUES (1)' },
        ]);
      } catch {
        failed = true;
      }
      const rows = await d.query('SELECT x FROM temp.conf_atomic');
      await d.batch([{ sql: 'DROP TABLE temp.conf_atomic' }]);
      check(failed, 'a duplicate primary key did not fail the batch');
      check(rows.length === 0, `expected a rollback, found ${rows.length} row(s)`);
    },
  },
  {
    name: 'JSON functions are available',
    async run(d) {
      const [r] = await d.query<{ a: string; b: string; n: number }>(
        `SELECT json_extract(json_set('{"x":{}}', '$.x.z', 'hi'), '$.x.z') AS a,
                json_object('k', 'v') AS b,
                (SELECT count(*) FROM json_each('[1,2,3]')) AS n`,
      );
      check(r.a === 'hi' && r.b === '{"k":"v"}' && r.n === 3, `JSON functions returned ${JSON.stringify(r)}`);
    },
  },
  {
    name: 'FTS5 contentless-delete tables support bm25 and deletes',
    async run(d) {
      const match = await createFts(d);
      const scored = await d.query<{ rowid: number; score: number }>(
        'SELECT rowid, bm25(conf_fts) AS score FROM temp.conf_fts WHERE conf_fts MATCH ?',
        [buildFtsQuery('比') as string],
      );
      check(scored.length === 2 && scored.every((r) => typeof r.score === 'number'), `bm25 returned ${JSON.stringify(scored)}`);
      await d.batch([{ sql: 'DELETE FROM temp.conf_fts WHERE rowid = ?', params: [1] }]);
      const after = await match('比喻');
      await dropFts(d);
      check(after.length === 0, `deleted row still matches: ${after.join()}`);
    },
  },
  {
    name: 'Chinese 1- and 2-character queries match adjacent characters only',
    async run(d) {
      const match = await createFts(d);
      const results = {
        '比喻': await match('比喻'),
        '喻': await match('喻'),
        '比喻 春天': await match('比喻 春天'),
        writ: await match('writ'),
        CAFE: await match('CAFE'),
      };
      await dropFts(d);
      check(same(results['比喻'], [1]), `"比喻" matched ${results['比喻'].join()}`);
      check(same(results['喻'], [1, 3]), `"喻" matched ${results['喻'].join()}`);
      check(same(results['比喻 春天'], [1]), `"比喻 春天" matched ${results['比喻 春天'].join()}`);
      check(same(results.writ, [2]), `"writ" matched ${results.writ.join()}`);
      check(same(results.CAFE, [2]), `"CAFE" matched ${results.CAFE.join()}`);
    },
  },
  {
    name: 'recursive CTEs terminate on cycles',
    async run(d) {
      const rows = await d.query<{ id: string }>(
        `WITH RECURSIVE e(p, c) AS (VALUES ('a', 'b'), ('b', 'c'), ('c', 'a')),
         d(id) AS (SELECT 'a' UNION SELECT e.c FROM e JOIN d ON e.p = d.id)
         SELECT id FROM d ORDER BY id`,
      );
      check(rows.map((r) => r.id).join() === 'a,b,c', `got ${rows.map((r) => r.id).join()}`);
    },
  },
];
```

- [ ] **Step 6: Run it to verify it passes**

Run: `docker compose run --rm dev pnpm vitest run packages/db/src/conformance.test.ts`
Expected: PASS (8 tests). Node prints an `ExperimentalWarning` for SQLite; that is expected.

- [ ] **Step 7: Commit**

```bash
git add packages/db pnpm-lock.yaml
git commit -m "feat(db): add SqlDriver interface, node:sqlite test driver and driver conformance suite"
```

---

### Task 12: Schema migration v1

**Files:**
- Create: `packages/db/src/migrations/0001_init.ts`, `packages/db/src/migrations/index.ts`, `packages/db/src/migrate.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/migrate.test.ts`

**Interfaces:**
- Consumes: `SqlDriver` (Task 11).
- Produces:
  - `interface Migration { version: number; statements: string[] }` and `migrations: Migration[]`
  - `migrate(driver: SqlDriver, list?: Migration[]): Promise<number>` — applies pending migrations, one batch each, and returns the resulting `user_version`

- [ ] **Step 1: Write the failing test**

`packages/db/src/migrate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { migrate } from './migrate';
import { migrations } from './migrations';

const tableNames = async (d: ReturnType<typeof createNodeDriver>) =>
  (await d.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((r) => r.name);

describe('migrate', () => {
  it('creates the full schema on a fresh database', async () => {
    const d = createNodeDriver();
    expect(await migrate(d)).toBe(1);
    expect(await tableNames(d)).toEqual(
      expect.arrayContaining([
        'article', 'article_revision', 'anchor', 'markup', 'side_note', 'memo', 'memo_update',
        'tag', 'tag_edge', 'tagging', 'outbox', 'kv', 'anchor_res', 'memo_link', 'memo_cache',
        'search_doc', 'search_fts',
      ]),
    );
  });

  it('is a no-op when already current', async () => {
    const d = createNodeDriver();
    await migrate(d);
    expect(await migrate(d)).toBe(1);
  });

  it('leaves the database untouched when a migration fails', async () => {
    const d = createNodeDriver();
    await migrate(d);
    const broken = [...migrations, { version: 2, statements: ['CREATE TABLE partial (x)', 'CREATE TABLE broken ('] }];
    await expect(migrate(d, broken)).rejects.toThrow();
    const [row] = await d.query<{ user_version: number }>('PRAGMA user_version');
    expect(row.user_version).toBe(1);
    expect(await tableNames(d)).not.toContain('partial');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm dev pnpm vitest run packages/db/src/migrate.test.ts`
Expected: FAIL with `Failed to resolve import "./migrate"`.

- [ ] **Step 3: Implement**

`packages/db/src/migrations/0001_init.ts`:
```ts
/** Version 1: the full sub-project 1 schema (spec §5.2). One SQL statement per string. */
export const initStatements: string[] = [
  // ===== Synced tables: id / hlc / fhlc / deleted, no foreign keys =====
  `CREATE TABLE article (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    source TEXT,
    lang TEXT,
    import_kind TEXT NOT NULL,
    current_revision_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE article_revision (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL,
    parent_id TEXT,
    blocks TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL
  )`,
  `CREATE TABLE anchor (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    start INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    exact TEXT NOT NULL,
    prefix TEXT NOT NULL,
    suffix TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'range' CHECK (unit IN ('range', 'block')),
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE markup (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL,
    anchor_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('term', 'line', 'paragraph')),
    style TEXT NOT NULL DEFAULT 'default',
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE side_note (
    id TEXT PRIMARY KEY,
    markup_id TEXT NOT NULL,
    article_id TEXT NOT NULL,
    body TEXT NOT NULL,
    sort_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE memo (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    home_article_id TEXT,
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE memo_update (
    id TEXT PRIMARY KEY,
    memo_id TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL
  )`,
  `CREATE TABLE tag (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    sort_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE tag_edge (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE tagging (
    id TEXT PRIMARY KEY,
    tag_id TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('article', 'markup', 'side_note', 'memo')),
    entity_id TEXT NOT NULL,
    article_id TEXT,
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  // ===== Sync plumbing =====
  `CREATE TABLE outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, op TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  // ===== Local-only derived tables (rebuildable, never synced) =====
  `CREATE TABLE anchor_res (
    anchor_id TEXT PRIMARY KEY,
    revision_id TEXT NOT NULL,
    start INTEGER,
    "end" INTEGER,
    status TEXT NOT NULL CHECK (status IN ('exact', 'mapped', 'fuzzy', 'orphan')),
    score REAL
  )`,
  `CREATE TABLE memo_link (
    memo_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('anchor', 'markup', 'side_note')),
    target_id TEXT NOT NULL,
    article_id TEXT NOT NULL,
    PRIMARY KEY (memo_id, node_id)
  )`,
  `CREATE TABLE memo_cache (memo_id TEXT PRIMARY KEY, text TEXT NOT NULL, snapshot BLOB, snapshot_hlc TEXT)`,
  `CREATE TABLE search_doc (
    rowid INTEGER PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    article_id TEXT,
    UNIQUE (entity_type, entity_id)
  )`,
  `CREATE VIRTUAL TABLE search_fts USING fts5(
    title, body, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2'
  )`,
  // ===== Indexes =====
  `CREATE INDEX article_revision_by_article ON article_revision (article_id)`,
  `CREATE INDEX anchor_by_article ON anchor (article_id)`,
  `CREATE INDEX markup_by_article ON markup (article_id)`,
  `CREATE INDEX side_note_by_markup ON side_note (markup_id)`,
  `CREATE INDEX memo_update_by_memo ON memo_update (memo_id, hlc)`,
  `CREATE INDEX tag_edge_by_parent ON tag_edge (parent_id) WHERE deleted = 0`,
  `CREATE INDEX tag_edge_by_child ON tag_edge (child_id) WHERE deleted = 0`,
  `CREATE INDEX tagging_by_tag ON tagging (tag_id) WHERE deleted = 0`,
  `CREATE INDEX tagging_by_entity ON tagging (entity_type, entity_id)`,
  `CREATE INDEX memo_link_by_target ON memo_link (target_type, target_id)`,
  `CREATE INDEX memo_link_by_article ON memo_link (article_id)`,
];
```

`packages/db/src/migrations/index.ts`:
```ts
import { initStatements } from './0001_init';

export interface Migration {
  version: number;
  statements: string[];
}

/** Ordered schema migrations. Never edit a shipped migration; append a new version instead. */
export const migrations: Migration[] = [{ version: 1, statements: initStatements }];
```

`packages/db/src/migrate.ts`:
```ts
import type { SqlDriver } from './driver';
import { migrations as defaultMigrations, type Migration } from './migrations';

/** Applies pending migrations, each in its own transaction together with its `user_version` bump. */
export async function migrate(driver: SqlDriver, list: Migration[] = defaultMigrations): Promise<number> {
  const [row] = await driver.query<{ user_version: number }>('PRAGMA user_version');
  let current = Number(row?.user_version ?? 0);
  for (const m of [...list].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    await driver.batch([...m.statements.map((sql) => ({ sql })), { sql: `PRAGMA user_version = ${m.version}` }]);
    current = m.version;
  }
  return current;
}
```

Append to `packages/db/src/index.ts`:
```ts
export * from './migrate';
export * from './migrations';
```

- [ ] **Step 4: Run it to verify it passes**

Run: `docker compose run --rm dev pnpm vitest run packages/db/src/migrate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): add schema v1 and transactional migration runner"
```

---

### Task 13: Latest-edit-wins op application, outbox and `Library`

**Files:**
- Create: `packages/db/src/ops.ts`, `packages/db/src/library.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/ops.test.ts`, `packages/db/src/library.test.ts`

**Interfaces:**
- Consumes: `Op`, `assertValidOp`, `encodeOp`, `IMMUTABLE_TABLES`, `OP_VERSION`, `Clock`, `createLock`, `Lock`, `newDeviceId` and `SyncedTable` from core; `migrate` (Task 12).
- Produces:
  - `opStatements(op: Op): Stmt[]`
  - `outboxStatement(op: Op, createdAt: number): Stmt`
  - `kvSetStatement(key: string, value: string): Stmt`
  - `interface OpInput { table: SyncedTable; id: string; fields: Record<string, SqlValue> }`
  - `class Library`:
    - `static open(driver, options?: { now?: () => number }): Promise<Library>`
    - properties `driver`, `deviceId`, `now: () => number` and `lock: Lock`
    - `commit(inputs: OpInput[], extra?: Stmt[] | ((ops: Op[]) => Stmt[])): Promise<Op[]>`

- [ ] **Step 1: Write the failing tests**

`packages/db/src/ops.test.ts`:
```ts
import { Clock, OP_VERSION, type Op } from '@jot/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import type { SqlDriver } from './driver';
import { migrate } from './migrate';
import { opStatements } from './ops';

const fresh = async () => {
  const d = createNodeDriver();
  await migrate(d);
  return d;
};
const apply = (d: SqlDriver, ops: Op[]) => d.batch(ops.flatMap(opStatements));
const op = (table: Op['table'], id: string, hlc: string, fields: Op['fields']): Op => ({ v: OP_VERSION, table, id, hlc, fields });
const readTag = async (d: SqlDriver, id: string) => {
  const [row] = await d.query<{ name: string; color: string | null; sort_key: string; deleted: number; hlc: string; fhlc: string }>(
    'SELECT name, color, sort_key, deleted, hlc, fhlc FROM tag WHERE id = ?',
    [id],
  );
  return row && { ...row, fhlc: JSON.parse(row.fhlc) as Record<string, string> };
};
const stamps = (n: number) => {
  const clock = new Clock('0000000000000001', null, () => 1000);
  return Array.from({ length: n }, () => clock.tick());
};

describe('opStatements', () => {
  it('inserts a row and records a clock per field', async () => {
    const d = await fresh();
    const [h] = stamps(1);
    await apply(d, [op('tag', 't1', h, { name: '比喻', color: null, sort_key: 'a0', created_at: 1 })]);
    expect(await readTag(d, 't1')).toEqual({
      name: '比喻', color: null, sort_key: 'a0', deleted: 0, hlc: h,
      fhlc: { name: h, color: h, sort_key: h, created_at: h },
    });
  });

  it('applies newer field writes and ignores older ones', async () => {
    const d = await fresh();
    const [h1, h2, h3] = stamps(3);
    await apply(d, [op('tag', 't1', h1, { name: 'a', color: null, sort_key: 'a0', created_at: 1 })]);
    await apply(d, [op('tag', 't1', h3, { name: 'new' })]);
    await apply(d, [op('tag', 't1', h2, { name: 'stale' })]);
    const row = await readTag(d, 't1');
    expect(row).toMatchObject({ name: 'new', hlc: h3 });
    expect(row?.fhlc.name).toBe(h3);
  });

  it('keeps concurrent edits to different fields', async () => {
    const d = await fresh();
    const [h1, h2, h3] = stamps(3);
    await apply(d, [op('tag', 't1', h1, { name: 'a', color: null, sort_key: 'a0', created_at: 1 })]);
    await apply(d, [op('tag', 't1', h3, { color: '#f00' })]);
    await apply(d, [op('tag', 't1', h2, { name: 'renamed' })]);
    expect(await readTag(d, 't1')).toMatchObject({ name: 'renamed', color: '#f00', hlc: h3 });
  });

  it('writes immutable rows exactly once', async () => {
    const d = await fresh();
    const [h1, h2] = stamps(2);
    const fields = { article_id: 'a1', parent_id: null, blocks: '[]', created_at: 1 };
    await apply(d, [op('article_revision', 'r1', h1, { ...fields, text: 'first' })]);
    await apply(d, [op('article_revision', 'r1', h2, { ...fields, text: 'second' })]);
    const rows = await d.query<{ text: string }>('SELECT text FROM article_revision');
    expect(rows).toEqual([{ text: 'first' }]);
  });

  it('handles reserved column names such as "end"', async () => {
    const d = await fresh();
    const [h] = stamps(1);
    await apply(d, [op('anchor', 'x1', h, {
      article_id: 'a1', revision_id: 'r1', start: 3, end: 5, exact: '比喻', prefix: '他用', suffix: '写春天', unit: 'range', created_at: 1,
    })]);
    expect(await d.query('SELECT start, "end" FROM anchor')).toEqual([{ start: 3, end: 5 }]);
  });

  it('converges no matter the order ops arrive in', async () => {
    const change = fc.oneof(
      fc.record({ field: fc.constant('name'), value: fc.string({ minLength: 1, maxLength: 5 }) }),
      fc.record({ field: fc.constant('color'), value: fc.option(fc.string({ maxLength: 5 })) }),
      fc.record({ field: fc.constant('deleted'), value: fc.constantFrom(0, 1) }),
    );
    const scenario = fc
      .array(change, { minLength: 1, maxLength: 8 })
      .chain((changes) =>
        fc.tuple(
          fc.constant(changes),
          fc.shuffledSubarray(changes.map((_, i) => i), { minLength: changes.length, maxLength: changes.length }),
        ),
      );
    await fc.assert(
      fc.asyncProperty(scenario, async ([changes, order]) => {
        const [base, ...hs] = stamps(changes.length + 1);
        const create = op('tag', 't1', base, { name: 'base', color: null, sort_key: 'a0', created_at: 1 });
        const ops = changes.map((c, i) => op('tag', 't1', hs[i], { [c.field]: c.value }));
        const [a, b] = [await fresh(), await fresh()];
        await apply(a, [create, ...ops]);
        await apply(b, [create, ...order.map((i) => ops[i])]);
        expect(await readTag(b, 't1')).toEqual(await readTag(a, 't1'));
      }),
      { numRuns: 50 },
    );
  });
});
```

`packages/db/src/library.test.ts`:
```ts
import { decodeOp } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { Library } from './library';

const tagFields = (name: string) => ({ name, color: null, sort_key: 'a0', created_at: 1 });

describe('Library', () => {
  it('creates a device id once and keeps it', async () => {
    const d = createNodeDriver();
    const first = await Library.open(d);
    const second = await Library.open(d);
    expect(first.deviceId).toMatch(/^[0-9a-f]{16}$/);
    expect(second.deviceId).toBe(first.deviceId);
  });

  it('commits rows and their outbox entries together', async () => {
    const lib = await Library.open(createNodeDriver(), { now: () => 1000 });
    const [op] = await lib.commit([{ table: 'tag', id: 't1', fields: tagFields('比喻') }]);
    expect(op).toMatchObject({ v: 1, table: 'tag', id: 't1', fields: tagFields('比喻') });
    const outbox = await lib.driver.query<{ op: string; created_at: number }>('SELECT op, created_at FROM outbox');
    expect(outbox.map((r) => decodeOp(r.op))).toEqual([op]);
    expect(outbox[0].created_at).toBe(1000);
    expect(await lib.driver.query('SELECT name FROM tag')).toEqual([{ name: '比喻' }]);
  });

  it('passes stamped ops to a derived-statement builder in the same transaction', async () => {
    const lib = await Library.open(createNodeDriver());
    const [op] = await lib.commit([{ table: 'tag', id: 't1', fields: tagFields('x') }], (ops) => [
      { sql: "INSERT INTO kv (k, v) VALUES ('probe', ?)", params: [ops[0].hlc] },
    ]);
    expect(await lib.driver.query("SELECT v FROM kv WHERE k = 'probe'")).toEqual([{ v: op.hlc }]);
  });

  it('rolls back rows and outbox when a derived statement fails', async () => {
    const lib = await Library.open(createNodeDriver());
    await expect(
      lib.commit([{ table: 'tag', id: 't1', fields: tagFields('x') }], [{ sql: 'INSERT INTO no_such_table VALUES (1)' }]),
    ).rejects.toThrow();
    expect(await lib.driver.query('SELECT id FROM tag')).toEqual([]);
    expect(await lib.driver.query('SELECT seq FROM outbox')).toEqual([]);
  });

  it('stamps later commits after earlier ones across restarts, even if the clock went backwards (Review Focus 4)', async () => {
    const d = createNodeDriver();
    const before = await Library.open(d, { now: () => 5_000_000 });
    const [a] = await before.commit([{ table: 'tag', id: 't1', fields: tagFields('x') }]);
    const after = await Library.open(d, { now: () => 0 });
    const [b] = await after.commit([{ table: 'tag', id: 't1', fields: { name: 'y' } }]);
    expect(b.hlc > a.hlc).toBe(true);
    expect(await d.query('SELECT name FROM tag')).toEqual([{ name: 'y' }]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose run --rm dev pnpm vitest run packages/db/src/ops.test.ts packages/db/src/library.test.ts`
Expected: FAIL with `Failed to resolve import "./ops"` and `"./library"`.

- [ ] **Step 3: Implement**

`packages/db/src/ops.ts`:
```ts
import { assertValidOp, encodeOp, IMMUTABLE_TABLES, type Op, type SqlValue } from '@jot/core';
import type { Stmt } from './driver';

/** Only ever applied to names from SYNCED_COLUMNS (checked by assertValidOp). */
const ident = (name: string) => `"${name}"`;

/** Collects positional parameters; call `bind` in the same order the `?`s appear in the SQL text. */
function paramList() {
  const params: SqlValue[] = [];
  const bind = (value: SqlValue) => {
    params.push(value);
    return '?';
  };
  return { params, bind };
}

/**
 * SQL that applies one op. Mutable tables use per-field latest-edit-wins: a field changes only if
 * the op's HLC is newer than the HLC recorded for that field in `fhlc`. Immutable tables insert once.
 *
 * Not an `INSERT … ON CONFLICT DO UPDATE`: SQLite checks NOT NULL before resolving the conflict, so a
 * partial op (e.g. `{ deleted: 1 }`) would fail. Instead: UPDATE the row if present, then INSERT it only
 * if absent — both in the caller's transaction.
 */
export function opStatements(op: Op): Stmt[] {
  assertValidOp(op);
  const cols = Object.keys(op.fields);
  if (cols.length === 0) return [];
  const table = ident(op.table);
  const colList = cols.map(ident).join(', ');

  if (IMMUTABLE_TABLES.has(op.table)) {
    const ins = paramList();
    const values = [ins.bind(op.id), ...cols.map((c) => ins.bind(op.fields[c] ?? null)), ins.bind(op.hlc)].join(', ');
    return [{ sql: `INSERT INTO ${table} (id, ${colList}, hlc) VALUES (${values}) ON CONFLICT (id) DO NOTHING`, params: ins.params }];
  }

  // Each fragment is built left to right so binds happen in textual order.
  const up = paramList();
  const fieldClock = (c: string) => `coalesce(json_extract(fhlc, ${up.bind(`$."${c}"`)}), '')`;
  const assignments = cols.map(
    (c) => `${ident(c)} = CASE WHEN ${up.bind(op.hlc)} > ${fieldClock(c)} THEN ${up.bind(op.fields[c] ?? null)} ELSE ${ident(c)} END`,
  );
  const clockUpdates = cols.map(
    (c) => `${up.bind(`$."${c}"`)}, CASE WHEN ${up.bind(op.hlc)} > ${fieldClock(c)} THEN ${up.bind(op.hlc)} ELSE ${fieldClock(c)} END`,
  );
  const update =
    `UPDATE ${table} SET ${assignments.join(', ')}, ` +
    `fhlc = json_set(fhlc, ${clockUpdates.join(', ')}), ` +
    `hlc = max(hlc, ${up.bind(op.hlc)}) WHERE id = ${up.bind(op.id)}`;

  const ins = paramList();
  const values = [
    ins.bind(op.id),
    ...cols.map((c) => ins.bind(op.fields[c] ?? null)),
    ins.bind(op.hlc),
    `json_object(${cols.map((c) => `${ins.bind(c)}, ${ins.bind(op.hlc)}`).join(', ')})`,
  ].join(', ');
  const insert =
    `INSERT INTO ${table} (id, ${colList}, hlc, fhlc) SELECT ${values} ` +
    `WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE id = ${ins.bind(op.id)})`;

  return [
    { sql: update, params: up.params },
    { sql: insert, params: ins.params },
  ];
}

export function outboxStatement(op: Op, createdAt: number): Stmt {
  return { sql: 'INSERT INTO outbox (op, created_at) VALUES (?, ?)', params: [encodeOp(op), createdAt] };
}

export function kvSetStatement(key: string, value: string): Stmt {
  return { sql: 'INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v', params: [key, value] };
}
```

`packages/db/src/library.ts`:
```ts
import { Clock, createLock, newDeviceId, OP_VERSION, type Lock, type Op, type SqlValue, type SyncedTable } from '@jot/core';
import type { SqlDriver, Stmt } from './driver';
import { migrate } from './migrate';
import { kvSetStatement, opStatements, outboxStatement } from './ops';

export interface OpInput {
  table: SyncedTable;
  id: string;
  fields: Record<string, SqlValue>;
}

export interface LibraryOptions {
  now?: () => number;
}

/** An open library: the one write path (`commit`) plus the device identity and clock. */
export class Library {
  /** Serializes read-then-write sequences such as the tag cycle check. */
  readonly lock: Lock = createLock();

  private constructor(
    readonly driver: SqlDriver,
    readonly deviceId: string,
    private readonly clock: Clock,
    readonly now: () => number,
  ) {}

  static async open(driver: SqlDriver, options: LibraryOptions = {}): Promise<Library> {
    const now = options.now ?? Date.now;
    await migrate(driver);
    const rows = await driver.query<{ k: string; v: string }>("SELECT k, v FROM kv WHERE k IN ('device_id', 'hlc_last')");
    const kv = new Map(rows.map((r) => [r.k, r.v] as const));
    let deviceId = kv.get('device_id');
    if (!deviceId) {
      deviceId = newDeviceId();
      await driver.batch([kvSetStatement('device_id', deviceId)]);
    }
    return new Library(driver, deviceId, new Clock(deviceId, kv.get('hlc_last') ?? null, now), now);
  }

  /**
   * Stamps each input with a fresh HLC and writes rows, outbox entries, `extra` derived statements
   * (search index, caches) and the persisted clock in ONE transaction.
   */
  async commit(inputs: OpInput[], extra: Stmt[] | ((ops: Op[]) => Stmt[]) = []): Promise<Op[]> {
    const ops: Op[] = inputs.map((input) => ({
      v: OP_VERSION,
      table: input.table,
      id: input.id,
      hlc: this.clock.tick(),
      fields: input.fields,
    }));
    const createdAt = this.now();
    await this.driver.batch([
      ...ops.flatMap((op) => opStatements(op)),
      ...ops.map((op) => outboxStatement(op, createdAt)),
      ...(typeof extra === 'function' ? extra(ops) : extra),
      kvSetStatement('hlc_last', this.clock.last()),
    ]);
    return ops;
  }
}
```

Append to `packages/db/src/index.ts`:
```ts
export * from './library';
export * from './ops';
```

- [ ] **Step 4: Run them to verify they pass**

Run: `docker compose run --rm dev pnpm vitest run packages/db/src/ops.test.ts packages/db/src/library.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): add per-field latest-edit-wins op application, outbox and Library.commit"
```

---

### Task 14: Search index and search query

**Files:**
- Create: `packages/db/src/search.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/search.test.ts`

**Interfaces:**
- Consumes: `buildFtsQuery`, `normalizeForIndex` and `EntityType` from core; `Library` (Task 13).
- Produces:
  - `interface SearchDoc { entityType: EntityType; entityId: string; articleId: string | null; title: string; body: string }`
  - `indexStatements(doc: SearchDoc): Stmt[]` — replaces any existing entry for the entity
  - `unindexStatements(entityType: EntityType, entityId: string): Stmt[]`
  - `interface SearchParams { text?: string; tagIds?: string[]; types?: EntityType[]; inherit?: boolean; limit?: number }`
  - `interface SearchHit { entityType: EntityType; entityId: string; articleId: string | null; rank: number }`
  - `search(driver: SqlDriver, params: SearchParams): Promise<SearchHit[]>` — lower rank is better. Several tags are ANDed, and each tag includes its descendants.

- [ ] **Step 1: Write the failing test**

`packages/db/src/search.test.ts`:
```ts
import { tagEdgeId, taggingId, type EntityType } from '@jot/core';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { Library } from './library';
import { indexStatements, search, unindexStatements, type SearchDoc, type SearchParams } from './search';

let lib: Library;
beforeEach(async () => {
  lib = await Library.open(createNodeDriver());
});

const index = (doc: SearchDoc) => lib.driver.batch(indexStatements(doc));
const ids = async (p: SearchParams) => (await search(lib.driver, p)).map((h) => `${h.entityType}:${h.entityId}`).sort();
const edge = (parent: string, child: string, deleted = 0) =>
  lib.commit([{ table: 'tag_edge', id: tagEdgeId(parent, child), fields: { parent_id: parent, child_id: child, deleted } }]);
const tag = (tagId: string, entityType: EntityType, entityId: string, articleId: string | null, deleted = 0) =>
  lib.commit([
    {
      table: 'tagging',
      id: taggingId(tagId, entityType, entityId),
      fields: { tag_id: tagId, entity_type: entityType, entity_id: entityId, article_id: articleId, created_at: 1, deleted },
    },
  ]);

async function seed() {
  await index({ entityType: 'article', entityId: 'a1', articleId: 'a1', title: '春', body: '他用比喻写春天。' });
  await index({ entityType: 'markup', entityId: 'm1', articleId: 'a1', title: '', body: '比喻' });
  await index({ entityType: 'side_note', entityId: 'n1', articleId: 'a1', title: '', body: '这里的比喻很妙' });
  await index({ entityType: 'memo', entityId: 'memo1', articleId: null, title: 'Notes on metaphor', body: 'Writers use metaphor.' });
}

describe('search', () => {
  it('finds a 2-character Chinese query across entity types', async () => {
    await seed();
    expect(await ids({ text: '比喻' })).toEqual(['article:a1', 'markup:m1', 'side_note:n1']);
  });

  it('finds English words by prefix', async () => {
    await seed();
    expect(await ids({ text: 'metaph' })).toEqual(['memo:memo1']);
  });

  it('filters by entity type', async () => {
    await seed();
    expect(await ids({ text: '比喻', types: ['markup', 'side_note'] })).toEqual(['markup:m1', 'side_note:n1']);
  });

  it('ranks title hits above body hits', async () => {
    await index({ entityType: 'memo', entityId: 'body', articleId: null, title: 'x', body: 'metaphor' });
    await index({ entityType: 'memo', entityId: 'title', articleId: null, title: 'metaphor', body: 'x' });
    const hits = await search(lib.driver, { text: 'metaphor' });
    expect(hits.map((h) => h.entityId)).toEqual(['title', 'body']);
  });

  it('replaces text on re-index and forgets it on unindex', async () => {
    await index({ entityType: 'side_note', entityId: 'n1', articleId: 'a1', title: '', body: '旧文字' });
    await index({ entityType: 'side_note', entityId: 'n1', articleId: 'a1', title: '', body: '新文字' });
    expect(await ids({ text: '旧' })).toEqual([]);
    expect(await ids({ text: '新' })).toEqual(['side_note:n1']);
    await lib.driver.batch(unindexStatements('side_note', 'n1'));
    expect(await ids({ text: '文字' })).toEqual([]);
  });

  it('filters by a tag including all its descendants, with or without keywords', async () => {
    await seed();
    await edge('技巧', '修辞');
    await edge('修辞', '比喻');
    await tag('比喻', 'side_note', 'n1', 'a1');
    expect(await ids({ text: '比喻', tagIds: ['技巧'] })).toEqual(['side_note:n1']);
    expect(await ids({ tagIds: ['技巧'] })).toEqual(['side_note:n1']);
  });

  it('inherits article tags only when asked', async () => {
    await seed();
    await tag('鲁迅', 'article', 'a1', 'a1');
    expect(await ids({ text: '比喻', tagIds: ['鲁迅'] })).toEqual(['article:a1']);
    expect(await ids({ text: '比喻', tagIds: ['鲁迅'], inherit: true })).toEqual(['article:a1', 'markup:m1', 'side_note:n1']);
  });

  it('requires every selected tag', async () => {
    await seed();
    await tag('X', 'side_note', 'n1', 'a1');
    await tag('Y', 'side_note', 'n1', 'a1');
    await tag('X', 'markup', 'm1', 'a1');
    expect(await ids({ tagIds: ['X', 'Y'] })).toEqual(['side_note:n1']);
  });

  it('ignores removed edges and taggings', async () => {
    await seed();
    await edge('P', 'C');
    await tag('C', 'markup', 'm1', 'a1');
    await edge('P', 'C', 1);
    expect(await ids({ tagIds: ['P'] })).toEqual([]);
    await tag('C', 'markup', 'm1', 'a1', 1);
    expect(await ids({ tagIds: ['C'] })).toEqual([]);
  });

  it('returns nothing for blank or punctuation-only text without tags (Review Focus 3)', async () => {
    await seed();
    expect(await search(lib.driver, { text: '   ' })).toEqual([]);
    expect(await search(lib.driver, { text: '。，！' })).toEqual([]);
    expect(await search(lib.driver, {})).toEqual([]);
  });

  it('never throws on arbitrary input (Review Focus 1)', async () => {
    await seed();
    const hostile = fc
      .array(fc.constantFrom('"', '*', '(', ')', ':', '-', '^', 'AND', 'OR', 'NOT', 'NEAR', ' ', '比', '喻', '😀', '\uD800'), { maxLength: 20 })
      .map((a) => a.join(''));
    await fc.assert(
      fc.asyncProperty(fc.oneof(fc.string(), hostile), async (text) => {
        expect(Array.isArray(await search(lib.driver, { text }))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm dev pnpm vitest run packages/db/src/search.test.ts`
Expected: FAIL with `Failed to resolve import "./search"`.

- [ ] **Step 3: Implement**

`packages/db/src/search.ts`:
```ts
import { buildFtsQuery, normalizeForIndex, type EntityType, type SqlValue } from '@jot/core';
import type { SqlDriver, Stmt } from './driver';

export interface SearchDoc {
  entityType: EntityType;
  entityId: string;
  /** The article the item belongs to (an article's own id for articles; null for memos). */
  articleId: string | null;
  title: string;
  body: string;
}

export function unindexStatements(entityType: EntityType, entityId: string): Stmt[] {
  return [
    {
      sql: 'DELETE FROM search_fts WHERE rowid = (SELECT rowid FROM search_doc WHERE entity_type = ? AND entity_id = ?)',
      params: [entityType, entityId],
    },
    { sql: 'DELETE FROM search_doc WHERE entity_type = ? AND entity_id = ?', params: [entityType, entityId] },
  ];
}

/** (Re)indexes one item; append to a Library.commit batch so the index never drifts from the data. */
export function indexStatements(doc: SearchDoc): Stmt[] {
  return [
    ...unindexStatements(doc.entityType, doc.entityId),
    {
      sql: 'INSERT INTO search_doc (entity_type, entity_id, article_id) VALUES (?, ?, ?)',
      params: [doc.entityType, doc.entityId, doc.articleId],
    },
    {
      sql: 'INSERT INTO search_fts (rowid, title, body) SELECT rowid, ?, ? FROM search_doc WHERE entity_type = ? AND entity_id = ?',
      params: [normalizeForIndex(doc.title), normalizeForIndex(doc.body), doc.entityType, doc.entityId],
    },
  ];
}

export interface SearchParams {
  text?: string;
  /** Every tag must match (AND); each tag also matches its descendants. */
  tagIds?: string[];
  types?: EntityType[];
  /** Also match items whose ARTICLE carries the tag (spec: toggle, off by default). */
  inherit?: boolean;
  limit?: number;
}

export interface SearchHit {
  entityType: EntityType;
  entityId: string;
  articleId: string | null;
  /** bm25 score; lower is better. 0 for tag-only searches. */
  rank: number;
}

export async function search(driver: SqlDriver, p: SearchParams): Promise<SearchHit[]> {
  const fts = p.text ? buildFtsQuery(p.text) : null;
  const tagIds = p.tagIds ?? [];
  if (fts === null && tagIds.length === 0) return [];

  // Bind in textual order: CTEs, then MATCH, then types, then LIMIT.
  const params: SqlValue[] = [];
  const ctes = tagIds.map((id, i) => {
    params.push(id);
    return `scope${i}(id) AS (SELECT ? UNION SELECT e.child_id FROM tag_edge e JOIN scope${i} s ON e.parent_id = s.id WHERE e.deleted = 0)`;
  });
  const where: string[] = [];
  let from = 'search_doc d';
  let rank = '0';
  if (fts !== null) {
    from = 'search_fts JOIN search_doc d ON d.rowid = search_fts.rowid';
    rank = 'bm25(search_fts, 5.0, 1.0)';
    where.push('search_fts MATCH ?');
    params.push(fts);
  }
  if (p.types && p.types.length > 0) {
    where.push(`d.entity_type IN (${p.types.map(() => '?').join(', ')})`);
    params.push(...p.types);
  }
  const inherit = p.inherit ? " OR (t.entity_type = 'article' AND t.entity_id = d.article_id)" : '';
  tagIds.forEach((_, i) => {
    where.push(
      `EXISTS (SELECT 1 FROM tagging t WHERE t.deleted = 0 AND t.tag_id IN (SELECT id FROM scope${i}) ` +
        `AND ((t.entity_type = d.entity_type AND t.entity_id = d.entity_id)${inherit}))`,
    );
  });
  params.push(p.limit ?? 50);

  const sql =
    (ctes.length > 0 ? `WITH RECURSIVE ${ctes.join(', ')} ` : '') +
    `SELECT d.entity_type AS entityType, d.entity_id AS entityId, d.article_id AS articleId, ${rank} AS rank ` +
    `FROM ${from}` +
    (where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY rank, d.rowid DESC LIMIT ?';
  return driver.query<SearchHit>(sql, params);
}
```

Append to `packages/db/src/index.ts`:
```ts
export * from './search';
```

- [ ] **Step 4: Run it to verify it passes**

Run: `docker compose run --rm dev pnpm vitest run packages/db/src/search.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): add FTS5 search index and keyword/tag/type search with tag inheritance"
```

---

### Task 15: Tag repository and post-sync repair

**Files:**
- Create: `packages/db/src/tags.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/tags.test.ts`

**Interfaces:**
- Consumes: `Library`, `OpInput` (Task 13); `newId`, `tagEdgeId`, `taggingId`, `foldTagName`, `planTagMerges`, `edgesToBreakCycles` and `EntityType` from core; `generateKeyBetween` from `fractional-indexing`.
- Produces:
  - error classes `InvalidTagNameError`, `DuplicateTagNameError` and `TagCycleError`
  - `type TagRow = { id; name; color: string | null; sort_key }` and `type TagEdgeRow = { id; parent_id; child_id; hlc }`
  - `interface TaggingTarget { tagId: string; entityType: EntityType; entityId: string; articleId: string | null }`
  - `listTags(lib)`, `listEdges(lib)`, `createTag(lib, { name, color? }): Promise<string>`, `renameTag(lib, id, name)` and `deleteTag(lib, id)`
  - `addParent(lib, childId, parentId)` and `removeParent(lib, childId, parentId)`
  - `tagEntity(lib, target)`, `untagEntity(lib, target)`, `tagsOf(lib, entityType, entityId): Promise<string[]>` and `descendantTagIds(lib, tagId): Promise<string[]>` (includes the tag itself)
  - `repairTagGraph(lib): Promise<{ mergedTags: { keep: string; drop: string[] }[]; removedEdges: string[] }>`

- [ ] **Step 1: Write the failing test**

`packages/db/src/tags.test.ts`:
```ts
import { tagEdgeId } from '@jot/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { Library } from './library';
import {
  addParent, createTag, deleteTag, descendantTagIds, DuplicateTagNameError, InvalidTagNameError, listEdges,
  listTags, removeParent, renameTag, repairTagGraph, TagCycleError, tagEntity, tagsOf, untagEntity,
} from './tags';

let lib: Library;
beforeEach(async () => {
  lib = await Library.open(createNodeDriver());
});

const createTags = async (...names: string[]) => {
  const ids: string[] = [];
  for (const name of names) ids.push(await createTag(lib, { name }));
  return ids;
};

describe('tags', () => {
  it('creates and lists tags in creation order', async () => {
    const a = await createTag(lib, { name: '技巧' });
    const b = await createTag(lib, { name: 'Metaphor', color: '#c33' });
    expect((await listTags(lib)).map((t) => [t.id, t.name, t.color])).toEqual([
      [a, '技巧', null],
      [b, 'Metaphor', '#c33'],
    ]);
  });

  it('rejects blank names (Review Focus 3)', async () => {
    await expect(createTag(lib, { name: '  　 ' })).rejects.toBeInstanceOf(InvalidTagNameError);
  });

  it('rejects names that differ only by case, width or spacing', async () => {
    await createTag(lib, { name: 'Metaphor' });
    await expect(createTag(lib, { name: ' ｍｅｔａｐｈｏｒ ' })).rejects.toBeInstanceOf(DuplicateTagNameError);
  });

  it('renames, refusing a duplicate name', async () => {
    const [a] = await createTags('比喻', '修辞');
    await renameTag(lib, a, '暗喻');
    expect((await listTags(lib)).map((t) => t.name)).toEqual(['暗喻', '修辞']);
    await expect(renameTag(lib, a, '修辞')).rejects.toBeInstanceOf(DuplicateTagNameError);
  });

  it('builds a multi-parent hierarchy', async () => {
    const [tech, rhetoric, imagery, metaphor] = await createTags('技巧', '修辞', '意象', '比喻');
    await addParent(lib, rhetoric, tech);
    await addParent(lib, metaphor, rhetoric);
    await addParent(lib, metaphor, imagery);
    expect((await descendantTagIds(lib, tech)).sort()).toEqual([tech, rhetoric, metaphor].sort());
    expect((await descendantTagIds(lib, imagery)).sort()).toEqual([imagery, metaphor].sort());
  });

  it('refuses edges that would create a cycle', async () => {
    const [a, b, c] = await createTags('A', 'B', 'C');
    await addParent(lib, b, a);
    await addParent(lib, c, b);
    await expect(addParent(lib, a, c)).rejects.toBeInstanceOf(TagCycleError);
    await expect(addParent(lib, a, a)).rejects.toBeInstanceOf(TagCycleError);
  });

  it('lets only one of two concurrent opposite edges through', async () => {
    const [a, b] = await createTags('A', 'B');
    const results = await Promise.allSettled([addParent(lib, a, b), addParent(lib, b, a)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await listEdges(lib)).toHaveLength(1);
  });

  it('removes and re-adds a parent', async () => {
    const [p, c] = await createTags('P', 'C');
    await addParent(lib, c, p);
    await removeParent(lib, c, p);
    expect(await listEdges(lib)).toEqual([]);
    await addParent(lib, c, p);
    expect(await listEdges(lib)).toMatchObject([{ parent_id: p, child_id: c }]);
  });

  it('tags and untags entities', async () => {
    const [t] = await createTags('T');
    const target = { tagId: t, entityType: 'markup' as const, entityId: 'm1', articleId: 'a1' };
    await tagEntity(lib, target);
    expect(await tagsOf(lib, 'markup', 'm1')).toEqual([t]);
    await untagEntity(lib, target);
    expect(await tagsOf(lib, 'markup', 'm1')).toEqual([]);
  });

  it('deleting a tag also removes its edges and taggings', async () => {
    const [p, c] = await createTags('P', 'C');
    await addParent(lib, c, p);
    await tagEntity(lib, { tagId: p, entityType: 'memo', entityId: 'memo1', articleId: null });
    await deleteTag(lib, p);
    expect((await listTags(lib)).map((t) => t.id)).toEqual([c]);
    expect(await listEdges(lib)).toEqual([]);
    expect(await tagsOf(lib, 'memo', 'memo1')).toEqual([]);
  });

  it('repairs cycles and duplicate names that arrive from other devices', async () => {
    const [a, b] = await createTags('A', 'B');
    await addParent(lib, b, a); // A → B
    // Simulate ops from another device that bypassed the local checks.
    await lib.commit([{ table: 'tag_edge', id: tagEdgeId(b, a), fields: { parent_id: b, child_id: a, deleted: 0 } }]);
    await lib.commit([{ table: 'tag', id: 'zzz-dup', fields: { name: 'a', color: null, sort_key: 'zz', created_at: 1 } }]);
    await tagEntity(lib, { tagId: 'zzz-dup', entityType: 'memo', entityId: 'memo1', articleId: null });

    const report = await repairTagGraph(lib);

    expect(report.mergedTags).toEqual([{ keep: a, drop: ['zzz-dup'] }]);
    expect(report.removedEdges).toEqual([tagEdgeId(b, a)]);
    expect(await tagsOf(lib, 'memo', 'memo1')).toEqual([a]);
    expect((await listTags(lib)).map((t) => t.id)).toEqual([a, b]);
    expect(await listEdges(lib)).toMatchObject([{ parent_id: a, child_id: b }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm dev pnpm vitest run packages/db/src/tags.test.ts`
Expected: FAIL with `Failed to resolve import "./tags"`.

- [ ] **Step 3: Implement**

`packages/db/src/tags.ts`:
```ts
import { edgesToBreakCycles, foldTagName, newId, planTagMerges, tagEdgeId, taggingId, type EntityType } from '@jot/core';
import { generateKeyBetween } from 'fractional-indexing';
import type { Library, OpInput } from './library';

export class InvalidTagNameError extends Error {
  constructor() {
    super('Tag name must not be empty');
    this.name = 'InvalidTagNameError';
  }
}

export class DuplicateTagNameError extends Error {
  constructor(name: string) {
    super(`A tag named "${name}" already exists`);
    this.name = 'DuplicateTagNameError';
  }
}

export class TagCycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TagCycleError';
  }
}

export type TagRow = { id: string; name: string; color: string | null; sort_key: string };
export type TagEdgeRow = { id: string; parent_id: string; child_id: string; hlc: string };
type TaggingRow = { id: string; tag_id: string; entity_type: EntityType; entity_id: string; article_id: string | null; created_at: number };

export interface TaggingTarget {
  tagId: string;
  entityType: EntityType;
  entityId: string;
  articleId: string | null;
}

const DESCENDANTS_SQL =
  'WITH RECURSIVE d(id) AS (SELECT ? UNION SELECT e.child_id FROM tag_edge e JOIN d ON e.parent_id = d.id WHERE e.deleted = 0) SELECT id FROM d';

function cleanName(name: string): string {
  const clean = name.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!clean) throw new InvalidTagNameError();
  return clean;
}

export function listTags(lib: Library): Promise<TagRow[]> {
  return lib.driver.query<TagRow>('SELECT id, name, color, sort_key FROM tag WHERE deleted = 0 ORDER BY sort_key, id');
}

export function listEdges(lib: Library): Promise<TagEdgeRow[]> {
  return lib.driver.query<TagEdgeRow>('SELECT id, parent_id, child_id, hlc FROM tag_edge WHERE deleted = 0 ORDER BY id');
}

export async function descendantTagIds(lib: Library, tagId: string): Promise<string[]> {
  return (await lib.driver.query<{ id: string }>(DESCENDANTS_SQL, [tagId])).map((r) => r.id);
}

export async function tagsOf(lib: Library, entityType: EntityType, entityId: string): Promise<string[]> {
  const rows = await lib.driver.query<{ tag_id: string }>(
    'SELECT tag_id FROM tagging WHERE deleted = 0 AND entity_type = ? AND entity_id = ? ORDER BY tag_id',
    [entityType, entityId],
  );
  return rows.map((r) => r.tag_id);
}

export async function createTag(lib: Library, input: { name: string; color?: string | null }): Promise<string> {
  const name = cleanName(input.name);
  return lib.lock.run(async () => {
    const tags = await listTags(lib);
    if (tags.some((t) => foldTagName(t.name) === foldTagName(name))) throw new DuplicateTagNameError(name);
    const lastKey = tags.reduce<string | null>((max, t) => (max === null || t.sort_key > max ? t.sort_key : max), null);
    const id = newId();
    await lib.commit([
      {
        table: 'tag',
        id,
        fields: { name, color: input.color ?? null, sort_key: generateKeyBetween(lastKey, null), created_at: lib.now() },
      },
    ]);
    return id;
  });
}

export async function renameTag(lib: Library, id: string, name: string): Promise<void> {
  const clean = cleanName(name);
  await lib.lock.run(async () => {
    const tags = await listTags(lib);
    if (tags.some((t) => t.id !== id && foldTagName(t.name) === foldTagName(clean))) throw new DuplicateTagNameError(clean);
    await lib.commit([{ table: 'tag', id, fields: { name: clean } }]);
  });
}

export async function deleteTag(lib: Library, id: string): Promise<void> {
  await lib.lock.run(async () => {
    const edges = await lib.driver.query<{ id: string }>(
      'SELECT id FROM tag_edge WHERE deleted = 0 AND (parent_id = ? OR child_id = ?)',
      [id, id],
    );
    const taggings = await lib.driver.query<{ id: string }>('SELECT id FROM tagging WHERE deleted = 0 AND tag_id = ?', [id]);
    await lib.commit([
      { table: 'tag', id, fields: { deleted: 1 } },
      ...edges.map((e): OpInput => ({ table: 'tag_edge', id: e.id, fields: { deleted: 1 } })),
      ...taggings.map((t): OpInput => ({ table: 'tagging', id: t.id, fields: { deleted: 1 } })),
    ]);
  });
}

export async function addParent(lib: Library, childId: string, parentId: string): Promise<void> {
  await lib.lock.run(async () => {
    if (childId === parentId) throw new TagCycleError('A tag cannot be its own parent');
    if ((await descendantTagIds(lib, childId)).includes(parentId)) {
      throw new TagCycleError('That parent is already below this tag');
    }
    await lib.commit([
      { table: 'tag_edge', id: tagEdgeId(parentId, childId), fields: { parent_id: parentId, child_id: childId, deleted: 0 } },
    ]);
  });
}

export async function removeParent(lib: Library, childId: string, parentId: string): Promise<void> {
  await lib.commit([
    { table: 'tag_edge', id: tagEdgeId(parentId, childId), fields: { parent_id: parentId, child_id: childId, deleted: 1 } },
  ]);
}

function taggingInput(target: TaggingTarget, createdAt: number, deleted: 0 | 1): OpInput {
  return {
    table: 'tagging',
    id: taggingId(target.tagId, target.entityType, target.entityId),
    fields: {
      tag_id: target.tagId,
      entity_type: target.entityType,
      entity_id: target.entityId,
      article_id: target.articleId,
      created_at: createdAt,
      deleted,
    },
  };
}

export async function tagEntity(lib: Library, target: TaggingTarget): Promise<void> {
  await lib.commit([taggingInput(target, lib.now(), 0)]);
}

export async function untagEntity(lib: Library, target: TaggingTarget): Promise<void> {
  await lib.commit([taggingInput(target, lib.now(), 1)]);
}

/**
 * Restores the tag invariants after edges or tags arrive from other devices (sync, JSON import):
 * duplicate names merge into the smallest id, then each cycle loses its newest edge.
 */
export async function repairTagGraph(
  lib: Library,
): Promise<{ mergedTags: { keep: string; drop: string[] }[]; removedEdges: string[] }> {
  return lib.lock.run(async () => {
    const mergedTags = planTagMerges(await listTags(lib));
    const redirect = new Map(mergedTags.flatMap((m) => m.drop.map((d) => [d, m.keep] as const)));

    if (redirect.size > 0) {
      const inputs: OpInput[] = [];
      for (const e of await listEdges(lib)) {
        const parent = redirect.get(e.parent_id) ?? e.parent_id;
        const child = redirect.get(e.child_id) ?? e.child_id;
        if (parent === e.parent_id && child === e.child_id) continue;
        inputs.push({ table: 'tag_edge', id: e.id, fields: { deleted: 1 } });
        if (parent !== child) {
          inputs.push({ table: 'tag_edge', id: tagEdgeId(parent, child), fields: { parent_id: parent, child_id: child, deleted: 0 } });
        }
      }
      const dropped = [...redirect.keys()];
      const taggings = await lib.driver.query<TaggingRow>(
        `SELECT id, tag_id, entity_type, entity_id, article_id, created_at FROM tagging WHERE deleted = 0 AND tag_id IN (${dropped.map(() => '?').join(', ')})`,
        dropped,
      );
      for (const t of taggings) {
        inputs.push({ table: 'tagging', id: t.id, fields: { deleted: 1 } });
        const keep = redirect.get(t.tag_id) as string;
        inputs.push(
          taggingInput({ tagId: keep, entityType: t.entity_type, entityId: t.entity_id, articleId: t.article_id }, t.created_at, 0),
        );
      }
      for (const id of dropped) inputs.push({ table: 'tag', id, fields: { deleted: 1 } });
      await lib.commit(inputs);
    }

    const edges = await listEdges(lib);
    const removedEdges = edgesToBreakCycles(
      edges.map((e) => ({ id: e.id, parent: e.parent_id, child: e.child_id, hlc: e.hlc })),
    );
    if (removedEdges.length > 0) {
      await lib.commit(removedEdges.map((id): OpInput => ({ table: 'tag_edge', id, fields: { deleted: 1 } })));
    }
    return { mergedTags, removedEdges };
  });
}
```

Append to `packages/db/src/index.ts`:
```ts
export * from './tags';
```

- [ ] **Step 4: Run it to verify it passes**

Run: `docker compose run --rm dev pnpm vitest run packages/db/src/tags.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Run the whole suite, type check and lint**

Run: `docker compose run --rm dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes, with no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): add tag repository with cycle prevention and post-sync repair"
```

---
### Task 16: `@jot/driver-web`: sqlite-wasm engine, in-memory driver and OPFS worker driver

**Files:**
- Create: `packages/driver-web/package.json`, `packages/driver-web/tsconfig.json`, `packages/driver-web/vitest.config.ts`, `packages/driver-web/src/engine.ts`, `packages/driver-web/src/memory.ts`, `packages/driver-web/src/protocol.ts`, `packages/driver-web/src/worker.ts`, `packages/driver-web/src/index.ts`
- Test: `packages/driver-web/src/memory.test.ts`

**Interfaces:**
- Consumes: `SqlDriver`, `Row`, `Stmt` and `SqlValue` from `@jot/db`; `conformanceCases` from `@jot/db/conformance`.
- Produces:
  - `createEngine(db: Oo1Database): Engine` — a synchronous engine over sqlite-wasm's `oo1.DB`, used by both the worker and the in-memory driver
  - `@jot/driver-web/memory` exports `createMemoryDriver(): Promise<SqlDriver>` (Node and tests)
  - `@jot/driver-web` exports:
    - `createWebDriver(filename?: string): Promise<SqlDriver>` — OPFS `opfs-sahpool` in a module worker, guarded by a Web Lock
    - `class DatabaseLockedError` (name `'DatabaseLockedError'`)
    - `class StorageUnavailableError` (name `'StorageUnavailableError'`)

- [ ] **Step 1: Create the package shell and add dependencies**

`packages/driver-web/package.json`:
```json
{
  "name": "@jot/driver-web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./memory": "./src/memory.ts"
  }
}
```

`packages/driver-web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/driver-web/vitest.config.ts`:
```ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'driver-web', include: ['src/**/*.test.ts'] },
});
```

Run: `docker compose run --rm dev pnpm --filter @jot/driver-web add "@jot/core@workspace:*" "@jot/db@workspace:*" @sqlite.org/sqlite-wasm`

- [ ] **Step 2: Write the failing test**

`packages/driver-web/src/memory.test.ts`:
```ts
import { conformanceCases } from '@jot/db/conformance';
import { describe, it } from 'vitest';
import { createMemoryDriver } from './memory';

describe('sqlite-wasm (in-memory) driver conformance', () => {
  for (const c of conformanceCases) {
    it(c.name, async () => c.run(await createMemoryDriver()));
  }
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `docker compose run --rm dev pnpm vitest run packages/driver-web`
Expected: FAIL with `Failed to resolve import "./memory"`.

- [ ] **Step 4: Implement the engine and the in-memory driver**

`packages/driver-web/src/engine.ts`:
```ts
import type { Row, SqlValue, Stmt } from '@jot/db';

/** The slice of sqlite-wasm's `oo1.DB` the engine uses. */
export interface Oo1Database {
  exec(options: { sql: string; bind?: SqlValue[]; rowMode: 'object'; returnValue: 'resultRows' }): unknown;
}

export interface Engine {
  query(sql: string, params?: SqlValue[]): Row[];
  batch(stmts: Stmt[]): void;
}

const MIN = BigInt(Number.MIN_SAFE_INTEGER);
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
/** sqlite-wasm may return 64-bit integers as bigint; other drivers return numbers when safe. */
const normalize = (v: SqlValue): SqlValue => (typeof v === 'bigint' && v >= MIN && v <= MAX ? Number(v) : v);

export function createEngine(db: Oo1Database): Engine {
  const run = (sql: string, params: SqlValue[] = []): Row[] => {
    const rows = db.exec({
      sql,
      ...(params.length > 0 ? { bind: params } : {}),
      rowMode: 'object',
      returnValue: 'resultRows',
    }) as Row[];
    return rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, normalize(v)])));
  };
  run('PRAGMA foreign_keys = ON');
  return {
    query: run,
    batch(stmts) {
      run('BEGIN IMMEDIATE');
      try {
        for (const s of stmts) run(s.sql, s.params);
        run('COMMIT');
      } catch (err) {
        run('ROLLBACK');
        throw err;
      }
    },
  };
}
```

`packages/driver-web/src/memory.ts`:
```ts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { SqlDriver, SqlValue, Stmt } from '@jot/db';
import { createEngine, type Oo1Database } from './engine';

let sqlite3: ReturnType<typeof sqlite3InitModule> | null = null;

/** In-memory sqlite-wasm driver: the web build's exact SQLite, runnable in Node tests. */
export async function createMemoryDriver(): Promise<SqlDriver> {
  sqlite3 ??= sqlite3InitModule();
  const s = await sqlite3;
  const engine = createEngine(new s.oo1.DB(':memory:', 'c') as unknown as Oo1Database);
  return {
    async query<T>(sql: string, params?: SqlValue[]) {
      return engine.query(sql, params) as T[];
    },
    async batch(stmts: Stmt[]) {
      engine.batch(stmts);
    },
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `docker compose run --rm dev pnpm vitest run packages/driver-web`
Expected: PASS (8 tests). If `sqlite_version()` < 3.43 or FTS5 is missing, stop: that contradicts spec §4.2, so report it rather than work around it.

- [ ] **Step 6: Implement the OPFS worker driver**

`packages/driver-web/src/protocol.ts`:
```ts
import type { Row, SqlValue, Stmt } from '@jot/db';

export type WorkerRequest =
  | { id: number; method: 'open'; filename: string }
  | { id: number; method: 'query'; sql: string; params?: SqlValue[] }
  | { id: number; method: 'batch'; stmts: Stmt[] };

export type WorkerResponse = { id: number; ok: true; result: Row[] | null } | { id: number; ok: false; error: string };

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
```

`packages/driver-web/src/worker.ts`:
```ts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { createEngine, type Engine, type Oo1Database } from './engine';
import type { WorkerRequest, WorkerResponse } from './protocol';

let engine: Promise<Engine> | null = null;

async function open(filename: string): Promise<Engine> {
  const sqlite3 = await sqlite3InitModule();
  // opfs-sahpool needs no COOP/COEP headers and is the fastest OPFS VFS; it allows one connection (one tab).
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'jot' });
  return createEngine(new pool.OpfsSAHPoolDb(filename) as unknown as Oo1Database);
}

const post = (message: WorkerResponse) => (self as unknown as { postMessage(m: WorkerResponse): void }).postMessage(message);

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.method === 'open') {
      engine = open(req.filename);
      await engine;
      post({ id: req.id, ok: true, result: null });
      return;
    }
    if (!engine) throw new Error('database is not open');
    const e = await engine;
    if (req.method === 'query') {
      post({ id: req.id, ok: true, result: e.query(req.sql, req.params) });
    } else {
      e.batch(req.stmts);
      post({ id: req.id, ok: true, result: null });
    }
  } catch (err) {
    post({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
```

`packages/driver-web/src/index.ts`:
```ts
import type { Row, SqlDriver, SqlValue, Stmt } from '@jot/db';
import type { DistributiveOmit, WorkerRequest, WorkerResponse } from './protocol';

export class DatabaseLockedError extends Error {
  constructor() {
    super('Jot is already open in another tab');
    this.name = 'DatabaseLockedError';
  }
}

export class StorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

/** Holds a Web Lock for the page's lifetime so only one tab opens the OPFS database. */
function acquireTabLock(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    void navigator.locks.request(name, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return;
      }
      resolve(true);
      return new Promise<void>(() => {}); // never released
    });
  });
}

/** The web build's driver: SQLite in a module worker, stored in OPFS. */
export async function createWebDriver(filename = '/jot.sqlite3'): Promise<SqlDriver> {
  if (!('locks' in navigator) || typeof navigator.storage?.getDirectory !== 'function') {
    throw new StorageUnavailableError('This browser does not support the storage Jot needs (OPFS and Web Locks).');
  }
  if (!(await acquireTabLock('jot-db'))) throw new DatabaseLockedError();
  void navigator.storage.persist?.();

  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let nextId = 1;
  const pending = new Map<number, { resolve(rows: Row[] | null): void; reject(err: Error): void }>();
  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const res = event.data;
    const waiter = pending.get(res.id);
    if (!waiter) return;
    pending.delete(res.id);
    if (res.ok) waiter.resolve(res.result);
    else waiter.reject(new Error(res.error));
  });
  const call = (req: DistributiveOmit<WorkerRequest, 'id'>) =>
    new Promise<Row[] | null>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...req, id });
    });

  try {
    await call({ method: 'open', filename });
  } catch (err) {
    worker.terminate();
    throw new StorageUnavailableError(err instanceof Error ? err.message : String(err));
  }

  return {
    async query<T>(sql: string, params?: SqlValue[]) {
      return ((await call({ method: 'query', sql, params })) ?? []) as T[];
    },
    async batch(stmts: Stmt[]) {
      await call({ method: 'batch', stmts });
    },
  };
}
```

- [ ] **Step 7: Type check, lint and run the package tests**

Run: `docker compose run --rm dev sh -c 'pnpm vitest run packages/driver-web && pnpm typecheck && pnpm lint'`
Expected: 8 tests pass, with no type or lint errors. The OPFS path is exercised end to end in Task 19.

- [ ] **Step 8: Commit**

```bash
git add packages/driver-web pnpm-lock.yaml
git commit -m "feat(driver-web): add sqlite-wasm engine, in-memory driver and OPFS worker driver"
```

---

### Task 17: Client diagnostics screen (web) and the Tauri driver bridge

**Files:**
- Create: `apps/client/package.json`, `apps/client/tsconfig.json`, `apps/client/vitest.config.ts`, `apps/client/vite.config.ts`, `apps/client/index.html`, `apps/client/src/main.tsx`, `apps/client/src/App.tsx`
- Create: `apps/client/src/platform/wire.ts`, `apps/client/src/platform/tauri.ts`, `apps/client/src/platform/index.ts`
- Create: `apps/client/src/diagnostics/runDiagnostics.ts`, `apps/client/src/diagnostics/Diagnostics.tsx`
- Test: `apps/client/src/platform/wire.test.ts`, `apps/client/src/diagnostics/runDiagnostics.test.ts`

**Interfaces:**
- Consumes: `Library` from `@jot/db`; `conformanceCases` and `ConformanceCase` from `@jot/db/conformance`; `createWebDriver` from `@jot/driver-web`; `bytesToBase64` and `base64ToBytes` from core.
- Produces:
  - `type WireValue = null | number | string | { $blob: string }`, `toWire(v: SqlValue): WireValue` and `fromWireRow(row): Row`. **Task 18's Rust side must produce and accept exactly this format.**
  - `isTauri(): boolean` and `createTauriDriver(): SqlDriver`. The Tauri commands it calls:
    - `db_query` with `{ sql: string, params: WireValue[] }`, returning `Record<string, WireValue>[]`
    - `db_batch` with `{ stmts: { sql: string, params: WireValue[] }[] }`, returning nothing
  - `type Platform = 'web' | 'desktop'` and `openPlatformDriver(): Promise<{ driver: SqlDriver; platform: Platform }>` — memoized per page
  - `runDiagnostics(driver, cases?): Promise<DiagnosticsReport>`, where `DiagnosticsReport = { sqliteVersion; bootCount; deviceId; cases: { name; ok; error? }[]; ok }`
  - DOM test IDs `diag-status` (`ok` or `failed`), `platform`, `sqlite-version`, `boot-count`, `diag-case`, `db-locked` and `db-unavailable`. **Task 19's end-to-end tests depend on these IDs.**

- [ ] **Step 1: Create the app shell and add dependencies**

`apps/client/package.json`:
```json
{
  "name": "@jot/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "e2e": "playwright test"
  }
}
```

`apps/client/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "types": ["node", "vite/client"] },
  "include": ["src", "vite.config.ts"]
}
```

`apps/client/vitest.config.ts`:
```ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'client', include: ['src/**/*.test.ts'] },
});
```

`apps/client/vite.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // sqlite-wasm loads its .wasm relative to its own module, so it must not be pre-bundled.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    watch: { usePolling: process.env.VITE_USE_POLLING === 'true' },
  },
});
```

`apps/client/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Jot</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Run: `docker compose run --rm dev sh -c 'pnpm --filter @jot/client add react react-dom @tauri-apps/api "@jot/core@workspace:*" "@jot/db@workspace:*" "@jot/driver-web@workspace:*" && pnpm --filter @jot/client add -D vite @vitejs/plugin-react @types/react @types/react-dom @types/node'`

- [ ] **Step 2: Write the failing tests**

`apps/client/src/platform/wire.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { fromWireRow, toWire } from './wire';

describe('Tauri wire format', () => {
  it('encodes blobs as base64 objects and passes scalars through', () => {
    expect(toWire(new Uint8Array([0, 1, 254, 255]))).toEqual({ $blob: 'AAH+/w==' });
    expect(toWire('中文')).toBe('中文');
    expect(toWire(null)).toBeNull();
    expect(toWire(1.5)).toBe(1.5);
    expect(toWire(12n)).toBe(12);
  });

  it('rejects integers the JSON bridge cannot carry exactly', () => {
    expect(() => toWire(2n ** 60n)).toThrow(RangeError);
  });

  it('decodes rows', () => {
    expect(fromWireRow({ a: 1, b: 'x', c: null, d: { $blob: 'AAH+/w==' } })).toEqual({
      a: 1,
      b: 'x',
      c: null,
      d: new Uint8Array([0, 1, 254, 255]),
    });
  });
});
```

`apps/client/src/diagnostics/runDiagnostics.test.ts`:
```ts
import { conformanceCases } from '@jot/db/conformance';
import { createNodeDriver } from '@jot/db/testing/node';
import { describe, expect, it } from 'vitest';
import { runDiagnostics } from './runDiagnostics';

describe('runDiagnostics', () => {
  it('opens the library, counts launches and runs every conformance case', async () => {
    const driver = createNodeDriver();
    const first = await runDiagnostics(driver);
    expect(first.ok).toBe(true);
    expect(first.bootCount).toBe(1);
    expect(first.cases).toHaveLength(conformanceCases.length);
    expect(first.deviceId).toMatch(/^[0-9a-f]{16}$/);
    const second = await runDiagnostics(driver);
    expect(second.bootCount).toBe(2);
    expect(second.deviceId).toBe(first.deviceId);
  });

  it('reports a failing case instead of throwing', async () => {
    const report = await runDiagnostics(createNodeDriver(), [
      { name: 'boom', run: async () => Promise.reject(new Error('nope')) },
    ]);
    expect(report.ok).toBe(false);
    expect(report.cases).toEqual([{ name: 'boom', ok: false, error: 'nope' }]);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `docker compose run --rm dev pnpm vitest run apps/client`
Expected: FAIL with `Failed to resolve import "./wire"` and `"./runDiagnostics"`.

- [ ] **Step 4: Implement**

`apps/client/src/platform/wire.ts`:
```ts
import { base64ToBytes, bytesToBase64, type SqlValue } from '@jot/core';
import type { Row } from '@jot/db';

/** How SqlValues cross the Tauri IPC bridge (JSON): blobs travel as { $blob: base64 }. */
export type WireValue = null | number | string | { $blob: string };

export function toWire(value: SqlValue): WireValue {
  if (value instanceof Uint8Array) return { $blob: bytesToBase64(value) };
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new RangeError(`integer ${value} is too large for the desktop driver`);
    }
    return Number(value);
  }
  return value;
}

export function fromWireRow(row: Record<string, WireValue>): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value !== null && typeof value === 'object' ? base64ToBytes(value.$blob) : value;
  }
  return out;
}
```

`apps/client/src/platform/tauri.ts`:
```ts
import { invoke } from '@tauri-apps/api/core';
import type { SqlDriver, SqlValue, Stmt } from '@jot/db';
import { fromWireRow, toWire, type WireValue } from './wire';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Native SQLite through the Rust commands in apps/desktop/src-tauri/src/db.rs. */
export function createTauriDriver(): SqlDriver {
  return {
    async query<T>(sql: string, params: SqlValue[] = []) {
      const rows = await invoke<Record<string, WireValue>[]>('db_query', { sql, params: params.map(toWire) });
      return rows.map(fromWireRow) as T[];
    },
    async batch(stmts: Stmt[]) {
      await invoke('db_batch', { stmts: stmts.map((s) => ({ sql: s.sql, params: (s.params ?? []).map(toWire) })) });
    },
  };
}
```

`apps/client/src/platform/index.ts`:
```ts
import type { SqlDriver } from '@jot/db';
import { createTauriDriver, isTauri } from './tauri';

export type Platform = 'web' | 'desktop';

export interface OpenedDriver {
  driver: SqlDriver;
  platform: Platform;
}

let opened: Promise<OpenedDriver> | null = null;

/** Opens the library database once per page: native SQLite under Tauri, OPFS in the browser. */
export function openPlatformDriver(): Promise<OpenedDriver> {
  opened ??= isTauri()
    ? Promise.resolve<OpenedDriver>({ driver: createTauriDriver(), platform: 'desktop' })
    : import('@jot/driver-web').then(
        async ({ createWebDriver }): Promise<OpenedDriver> => ({ driver: await createWebDriver(), platform: 'web' }),
      );
  return opened;
}
```

`apps/client/src/diagnostics/runDiagnostics.ts`:
```ts
import { Library, type SqlDriver } from '@jot/db';
import { conformanceCases, type ConformanceCase } from '@jot/db/conformance';

export interface CaseResult {
  name: string;
  ok: boolean;
  error?: string;
}

export interface DiagnosticsReport {
  sqliteVersion: string;
  bootCount: number;
  deviceId: string;
  cases: CaseResult[];
  ok: boolean;
}

/** Opens (and migrates) the library, bumps a launch counter, and runs the driver conformance suite. */
export async function runDiagnostics(driver: SqlDriver, cases: ConformanceCase[] = conformanceCases): Promise<DiagnosticsReport> {
  const lib = await Library.open(driver);
  await driver.batch([
    {
      sql: "INSERT INTO kv (k, v) VALUES ('diag_boot_count', '1') ON CONFLICT (k) DO UPDATE SET v = CAST(CAST(v AS INTEGER) + 1 AS TEXT)",
    },
  ]);
  const [boot] = await driver.query<{ v: string }>("SELECT v FROM kv WHERE k = 'diag_boot_count'");
  const [version] = await driver.query<{ v: string }>('SELECT sqlite_version() AS v');
  const results: CaseResult[] = [];
  for (const c of cases) {
    try {
      await c.run(driver);
      results.push({ name: c.name, ok: true });
    } catch (err) {
      results.push({ name: c.name, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return {
    sqliteVersion: version.v,
    bootCount: Number(boot.v),
    deviceId: lib.deviceId,
    cases: results,
    ok: results.every((r) => r.ok),
  };
}
```

`apps/client/src/diagnostics/Diagnostics.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { openPlatformDriver, type Platform } from '../platform';
import { runDiagnostics, type DiagnosticsReport } from './runDiagnostics';

type Outcome =
  | { kind: 'done'; platform: Platform; report: DiagnosticsReport }
  | { kind: 'locked' }
  | { kind: 'unavailable'; message: string };

let started: Promise<Outcome> | null = null;

/** Runs once per page load, even if React mounts the component twice. */
function loadOnce(): Promise<Outcome> {
  started ??= (async (): Promise<Outcome> => {
    try {
      const { driver, platform } = await openPlatformDriver();
      return { kind: 'done', platform, report: await runDiagnostics(driver) };
    } catch (err) {
      if (err instanceof Error && err.name === 'DatabaseLockedError') return { kind: 'locked' };
      return { kind: 'unavailable', message: err instanceof Error ? err.message : String(err) };
    }
  })();
  return started;
}

export function Diagnostics() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    let active = true;
    void loadOnce().then((o) => {
      if (active) setOutcome(o);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!outcome) return <p data-testid="diag-loading">Opening library…</p>;
  if (outcome.kind === 'locked') {
    return <p data-testid="db-locked">Jot is already open in another tab. Close it to continue here.</p>;
  }
  if (outcome.kind === 'unavailable') {
    return <p data-testid="db-unavailable">Storage is unavailable: {outcome.message}</p>;
  }

  const { platform, report } = outcome;
  return (
    <main style={{ fontFamily: 'system-ui, "Noto Sans CJK SC", sans-serif', padding: 24 }}>
      <h1>Jot storage diagnostics</h1>
      <dl>
        <dt>Status</dt>
        <dd data-testid="diag-status">{report.ok ? 'ok' : 'failed'}</dd>
        <dt>Platform</dt>
        <dd data-testid="platform">{platform}</dd>
        <dt>SQLite</dt>
        <dd data-testid="sqlite-version">{report.sqliteVersion}</dd>
        <dt>Device</dt>
        <dd>{report.deviceId}</dd>
        <dt>Launches</dt>
        <dd data-testid="boot-count">{report.bootCount}</dd>
      </dl>
      <ul>
        {report.cases.map((c) => (
          <li key={c.name} data-testid="diag-case">
            {c.ok ? '✓' : '✗'} {c.name}
            {c.error ? ` — ${c.error}` : ''}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

`apps/client/src/App.tsx`:
```tsx
import { Diagnostics } from './diagnostics/Diagnostics';

/** Plan 1 ships only the storage diagnostics screen; plan 2 replaces this with the app shell. */
export function App() {
  return <Diagnostics />;
}
```

`apps/client/src/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm dev pnpm vitest run apps/client`
Expected: PASS (5 tests).

- [ ] **Step 6: Build, type check and lint**

Run: `docker compose run --rm dev sh -c 'pnpm --filter @jot/client build && pnpm typecheck && pnpm lint'`
Expected: Vite writes `apps/client/dist/` with a worker chunk and `sqlite3.wasm`, and there are no type or lint errors.

- [ ] **Step 7: Check it by hand in a browser**

Run: `docker compose up web`, then open `http://localhost:5173` in Edge or Chrome on Windows.
Expected:
- Status `ok`, platform `web`, SQLite 3.4x or newer, and ✓ on all 8 cases.
- Reloading bumps "Launches" by 1.
- A second tab shows "Jot is already open in another tab".

Stop the server with Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add apps/client pnpm-lock.yaml
git commit -m "feat(client): add storage diagnostics screen, platform driver selection and Tauri wire codec"
```

---

### Task 18: Tauri desktop shell with native SQLite commands

**Files:**
- Create: `apps/desktop/package.json`, `apps/desktop/scripts/make-icon.mjs`
- Create: `apps/desktop/src-tauri/Cargo.toml`, `build.rs`, `tauri.conf.json`, `capabilities/default.json`, `src/main.rs`, `src/lib.rs`, `src/db.rs`, and `icons/*` (generated)
- Test: the `#[cfg(test)] mod tests` block inside `apps/desktop/src-tauri/src/db.rs`

**Interfaces:**
- Consumes: the wire format and command contract from Task 17: `db_query(sql, params) -> rows` and `db_batch(stmts)`. Blobs travel as `{"$blob": base64}`.
- Produces:
  - the Rust functions `configure(&Connection)`, `run_query(&Connection, &str, &[Value]) -> Result<Vec<Map<String, Value>>, String>` and `run_batch(&mut Connection, &[Stmt]) -> Result<(), String>`
  - the Tauri commands `db_query` and `db_batch`
  - the database file `<app data dir>/jot.sqlite3`

- [ ] **Step 1: Create the package and generate icons**

`apps/desktop/package.json`:
```json
{
  "name": "@jot/desktop",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "tauri": "tauri"
  }
}
```

`apps/desktop/scripts/make-icon.mjs`:
```js
// Writes a solid 1024×1024 RGBA PNG used as the source for `tauri icon` (placeholder until real branding).
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const size = 1024;
const [r, g, b] = [0x2f, 0x4f, 0x6f];
const row = Buffer.alloc(1 + size * 4); // filter byte 0, then RGBA pixels
for (let x = 0; x < size; x++) row.set([r, g, b, 255], 1 + x * 4);
const raw = Buffer.concat(Array.from({ length: size }, () => row));

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8; // bit depth
header[9] = 6; // colour type RGBA
writeFileSync(
  process.argv[2] ?? 'app-icon.png',
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
```

Run: `docker compose run --rm dev sh -c 'pnpm --filter @jot/desktop add -D @tauri-apps/cli@^2 && cd apps/desktop && node scripts/make-icon.mjs app-icon.png && pnpm tauri icon app-icon.png && rm app-icon.png'`
Expected: `apps/desktop/src-tauri/icons/` contains `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns` and `icon.ico`.

- [ ] **Step 2: Write the Tauri project files**

`apps/desktop/src-tauri/Cargo.toml`:
```toml
[package]
name = "jot-desktop"
version = "0.1.0"
edition = "2021"
rust-version = "1.90"

[lib]
name = "jot_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.37", features = ["bundled"] }
base64 = "0.22"
```

`apps/desktop/src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

`apps/desktop/src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Jot",
  "version": "0.1.0",
  "identifier": "app.jot.desktop",
  "build": {
    "devUrl": "http://localhost:5173",
    "frontendDist": "../../client/dist",
    "beforeDevCommand": "pnpm --filter @jot/client dev",
    "beforeBuildCommand": "pnpm --filter @jot/client build"
  },
  "app": {
    "windows": [{ "title": "Jot", "width": 1280, "height": 800 }],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```

`apps/desktop/src-tauri/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Permissions for the main window",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

`apps/desktop/src-tauri/src/main.rs`:
```rust
// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    jot_desktop_lib::run()
}
```

`apps/desktop/src-tauri/src/lib.rs`:
```rust
mod db;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("jot.sqlite3"))?;
            app.manage(db::Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![db::db_query, db::db_batch])
        .run(tauri::generate_context!())
        .expect("error while running Jot");
}
```

- [ ] **Step 3: Write the failing Rust tests**

`apps/desktop/src-tauri/src/db.rs` (tests only for now):
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        configure(&conn).unwrap();
        conn
    }

    #[test]
    fn round_trips_every_value_type() {
        let conn = mem();
        let rows = run_query(
            &conn,
            "SELECT ? AS n, ? AS i, ? AS f, ? AS t, ? AS b",
            &[json!(null), json!(1727430000123i64), json!(1.5), json!("中文 😀"), json!({ "$blob": "AAH+/w==" })],
        )
        .unwrap();
        assert_eq!(rows.len(), 1);
        let row = &rows[0];
        assert_eq!(row["n"], json!(null));
        assert_eq!(row["i"], json!(1727430000123i64));
        assert_eq!(row["f"], json!(1.5));
        assert_eq!(row["t"], json!("中文 😀"));
        assert_eq!(row["b"], json!({ "$blob": "AAH+/w==" }));
    }

    #[test]
    fn batch_rolls_back_on_error() {
        let mut conn = mem();
        run_batch(&mut conn, &[Stmt { sql: "CREATE TABLE t (x INTEGER PRIMARY KEY)".into(), params: vec![] }]).unwrap();
        let err = run_batch(
            &mut conn,
            &[
                Stmt { sql: "INSERT INTO t VALUES (?)".into(), params: vec![json!(1)] },
                Stmt { sql: "INSERT INTO t VALUES (?)".into(), params: vec![json!(1)] },
            ],
        );
        assert!(err.is_err());
        assert!(run_query(&conn, "SELECT x FROM t", &[]).unwrap().is_empty());
    }

    #[test]
    fn bundled_sqlite_is_recent_and_has_fts5() {
        let conn = mem();
        let rows = run_query(&conn, "SELECT sqlite_version() AS v", &[]).unwrap();
        let version = rows[0]["v"].as_str().unwrap().to_string();
        let parts: Vec<u32> = version.split('.').map(|p| p.parse().unwrap()).collect();
        assert!(parts[0] > 3 || (parts[0] == 3 && parts[1] >= 43), "SQLite {version} < 3.43");
        run_query(
            &conn,
            "CREATE VIRTUAL TABLE f USING fts5(body, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2')",
            &[],
        )
        .unwrap();
        run_query(&conn, "INSERT INTO f (rowid, body) VALUES (1, ' 比  喻 ')", &[]).unwrap();
        let hits = run_query(&conn, "SELECT rowid FROM f WHERE f MATCH ?", &[json!("\"比 喻\"")]).unwrap();
        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn rejects_unsupported_params() {
        let conn = mem();
        assert!(run_query(&conn, "SELECT ?", &[json!([1, 2])]).is_err());
        assert!(run_query(&conn, "SELECT ?", &[json!({ "x": 1 })]).is_err());
    }
}
```

- [ ] **Step 4: Run them to verify they fail**

Run: `docker compose run --rm dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'`
Expected: FAIL to compile with errors such as `cannot find function run_query` and `cannot find type Connection`. The first run also downloads and compiles the Tauri crates, which takes several minutes.

- [ ] **Step 5: Implement `db.rs`** (put this above the tests module)

```rust
//! Native SQLite for the desktop build. Mirrors the TypeScript `SqlDriver`: `db_query` runs one
//! statement and returns rows as objects; `db_batch` runs statements in one IMMEDIATE transaction.
//! Values cross the IPC bridge as JSON; blobs travel as {"$blob": "<base64>"} (apps/client/src/platform/wire.ts).

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection, TransactionBehavior};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

pub struct Db(pub Mutex<Connection>);

#[derive(Deserialize)]
pub struct Stmt {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Value>,
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    configure(&conn)?;
    Ok(conn)
}

pub fn configure(conn: &Connection) -> rusqlite::Result<()> {
    conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get::<_, String>(0))?;
    conn.execute_batch("PRAGMA foreign_keys = ON")?;
    conn.busy_timeout(Duration::from_secs(5))?;
    Ok(())
}

fn to_sql(value: &Value) -> Result<SqlValue, String> {
    Ok(match value {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => match n.as_i64() {
            Some(i) => SqlValue::Integer(i),
            None => SqlValue::Real(n.as_f64().ok_or("unsupported number")?),
        },
        Value::String(s) => SqlValue::Text(s.clone()),
        Value::Object(o) => match (o.len(), o.get("$blob")) {
            (1, Some(Value::String(b64))) => SqlValue::Blob(B64.decode(b64).map_err(|e| e.to_string())?),
            _ => return Err("unsupported object parameter".into()),
        },
        Value::Array(_) => return Err("array parameters are not supported".into()),
    })
}

fn from_sql(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => {
            let mut blob = Map::new();
            blob.insert("$blob".into(), Value::String(B64.encode(b)));
            Value::Object(blob)
        }
    }
}

pub fn run_query(conn: &Connection, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
    let values = params.iter().map(to_sql).collect::<Result<Vec<_>, _>>()?;
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut rows = stmt.query(params_from_iter(values.iter())).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut obj = Map::new();
        for (i, name) in names.iter().enumerate() {
            obj.insert(name.clone(), from_sql(row.get_ref(i).map_err(|e| e.to_string())?));
        }
        out.push(obj);
    }
    Ok(out)
}

pub fn run_batch(conn: &mut Connection, stmts: &[Stmt]) -> Result<(), String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    for s in stmts {
        run_query(&tx, &s.sql, &s.params)?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn db_query(
    db: tauri::State<'_, Db>,
    sql: String,
    params: Option<Vec<Value>>,
) -> Result<Vec<Map<String, Value>>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    run_query(&conn, &sql, params.as_deref().unwrap_or(&[]))
}

#[tauri::command]
pub async fn db_batch(db: tauri::State<'_, Db>, stmts: Vec<Stmt>) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    run_batch(&mut conn, &stmts)
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose run --rm dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'`
Expected: `test result: ok. 4 passed`.

- [ ] **Step 7: Run the desktop app through WSLg and check it by hand**

Run: `docker compose up desktop`
Expected:
- A "Jot" window opens on the Windows desktop.
- It shows Status `ok`, platform `desktop`, SQLite 3.4x or newer, and ✓ on all 8 cases.
- Chinese renders correctly, not as boxes.
- After you close the window and run the command again, "Launches" has increased by 1.

If the window is blank, confirm that `compose.wslg.yaml` is active (`COMPOSE_FILE` in `.env`) and that the `WEBKIT_DISABLE_*` variables are set. Stop with Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop pnpm-lock.yaml
git commit -m "feat(desktop): add Tauri shell with native rusqlite db_query/db_batch commands"
```

---

### Task 19: End-to-end tests on Chromium and WebKit

**Files:**
- Create: `apps/client/playwright.config.ts`, `apps/client/e2e/diagnostics.spec.ts`
- Modify: `apps/client/tsconfig.json` (add `e2e` and `playwright.config.ts` to `include`)

**Interfaces:**
- Consumes: the test IDs from Task 17; the `web` and `playwright` compose services from Task 1.
- Produces: `pnpm --filter @jot/client e2e`, which runs against a browser server given by `PW_WS`.

- [ ] **Step 1: Add Playwright, pinned to the browser server's version**

Run: `docker compose run --rm dev pnpm --filter @jot/client add -D @playwright/test@1.63.0`

In `apps/client/tsconfig.json`, set `"include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]`.

- [ ] **Step 2: Write the config and the tests**

`apps/client/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

/** Browsers run in the `playwright` compose service; this runner connects to them over WebSocket. */
const wsEndpoint = process.env.PW_WS;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    ...(wsEndpoint ? { connectOptions: { wsEndpoint } } : {}),
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
```

`apps/client/e2e/diagnostics.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

const READY = { timeout: 30_000 };

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) console.log(await page.locator('body').innerText());
});

test('the OPFS driver passes every conformance case', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('diag-status')).toHaveText('ok', READY);
  await expect(page.getByTestId('platform')).toHaveText('web');
  await expect(page.getByTestId('diag-case')).toHaveCount(8);
});

test('library data survives a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('diag-status')).toHaveText('ok', READY);
  const first = Number(await page.getByTestId('boot-count').textContent());
  await page.reload();
  await expect(page.getByTestId('diag-status')).toHaveText('ok', READY);
  await expect(page.getByTestId('boot-count')).toHaveText(String(first + 1));
});

test('a second tab is told the library is open elsewhere', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('diag-status')).toHaveText('ok', READY);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByTestId('db-locked')).toBeVisible(READY);
});
```

- [ ] **Step 3: Run the end-to-end suite**

Run:
```bash
docker compose up -d web
docker compose --profile e2e up -d playwright
docker compose exec -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e
```
Expected: 6 tests pass (3 on chromium and 3 on webkit).

**Stop condition:** if a test fails, read the printed page text before changing anything.
- It is a known environment limit, not a product bug, **only** when the WebKit project shows `db-unavailable` with an OPFS error (`getDirectory` or `createSyncAccessHandle`), because Playwright's WebKit contexts are ephemeral like Safari private browsing.
- In that case add `test.skip(({ browserName }) => browserName === 'webkit', 'OPFS unavailable in ephemeral Playwright WebKit contexts; covered by manual Safari check')` at the top of the spec, and say so in the Task 19 commit message.
- Any other failure is a bug to fix.

Then run: `docker compose --profile e2e down`

- [ ] **Step 4: Type check and lint**

Run: `docker compose run --rm dev sh -c 'pnpm typecheck && pnpm lint'`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/client pnpm-lock.yaml
git commit -m "test(client): add Playwright e2e for OPFS storage on Chromium and WebKit"
```

---

### Task 20: CI workflow and developer README

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: every command established in Tasks 1–19.
- Produces: a CI job that runs type checking, lint, Vitest, Rust tests and the end-to-end tests, all through the same Docker setup used locally.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-24.04
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4

      - name: Configure compose for CI
        run: |
          cp .env.example .env
          sed -i "s/^UID=.*/UID=$(id -u)/; s/^GID=.*/GID=$(id -g)/; s/^COMPOSE_FILE=.*/COMPOSE_FILE=compose.yaml/" .env
          scripts/bootstrap.sh

      - run: docker compose build dev
      - run: docker compose run --rm -T dev pnpm install --frozen-lockfile
      - run: docker compose run --rm -T dev pnpm typecheck
      - run: docker compose run --rm -T dev pnpm lint
      - run: docker compose run --rm -T dev pnpm test

      - name: Rust tests (native SQLite driver)
        run: docker compose run --rm -T dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'

      - name: End-to-end (Chromium + WebKit)
        run: |
          docker compose up -d web
          docker compose --profile e2e up -d playwright
          timeout 120 sh -c 'until curl -sf http://127.0.0.1:5173 >/dev/null; do sleep 2; done'
          docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ -e CI=1 web pnpm --filter @jot/client e2e

      - name: Service logs
        if: always()
        run: docker compose --profile e2e logs --no-color web playwright | tail -200
```

- [ ] **Step 2: Write `README.md`**

````markdown
# Jot

A library for writers who study model articles: import them, mark up terms, lines and paragraphs,
keep side notes, and write analysis memos side by side. Desktop (Windows, macOS) and web.

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

End-to-end tests (Chromium + WebKit):

```sh
docker compose up -d web
docker compose --profile e2e up -d playwright
docker compose exec -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e
```

Rust tests: `docker compose run --rm dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'`

### Notes

- `.env` sets `COMPOSE_FILE=compose.yaml:compose.wslg.yaml` so the desktop window reaches WSLg. `WSLG_ROOT`
  is `/run/desktop/mnt/host/wslg` under Docker Desktop and `/mnt/wslg` under Docker Engine inside WSL.
- When adding a workspace package, add its `node_modules` volume to `compose.yaml` **and** `scripts/bootstrap.sh`.
- `pnpm install` refuses to run outside the container (`scripts/require-container.mjs`).

## Layout

| Path | Role |
|---|---|
| `packages/core` | Pure domain logic: ids, HLC, ops, search text, blocks, anchoring, tag graph |
| `packages/db` | SQLite schema, migrations, latest-edit-wins write path, search, tags, driver conformance suite |
| `packages/driver-web` | sqlite-wasm + OPFS worker driver (and an in-memory driver for tests) |
| `apps/client` | React UI shared by web and desktop |
| `apps/desktop` | Tauri 2 shell with native `rusqlite` commands |
````

- [ ] **Step 3: Run the full local check the way CI does**

Run:
```bash
docker compose run --rm dev sh -c 'pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test'
docker compose run --rm dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'
```
Expected: every command exits 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: run typecheck, lint, unit, Rust and e2e tests in Docker; add developer README"
```

---

## Done when

- `docker compose run --rm dev sh -c 'pnpm typecheck && pnpm lint && pnpm test'` passes. That covers every unit test and property test, plus conformance on `node:sqlite` and sqlite-wasm.
- `cargo test` passes for the native driver.
- The Playwright suite passes on Chromium, and on WebKit unless the documented OPFS limit applies.
- The diagnostics screen shows `ok` in a Windows browser (`docker compose up web`) and in the Tauri window through WSLg (`docker compose up desktop`).
- Nothing was installed on the host. `node --version` on the host still prints v18.
