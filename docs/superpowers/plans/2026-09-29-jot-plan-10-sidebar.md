# Plan 10: Sidebar layout and the collapsed rail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the sidebar consistent, symmetric row hovers and aligned items, keep folded sections at the top when all are folded, move Settings, Trash and the sidebar toggle into a footer band, and turn the collapsed sidebar into an icon rail.

**Architecture:** Mostly CSS in `apps/client/src/styles/app.css`, driven by two new tokens (`--row-hover`, `--footer-band`) and one inset (`--item-inset`, the width of a heading's fold arrow plus its gap). `Sidebar.tsx` gains a footer band holding the toggle, a rule that all-folded sections stay at the top, and a collapsed rail of three page links. `Shell` passes the current page name so the rail can mark it. No new dependencies, no data changes.

**Tech Stack:** React 19, TypeScript, plain CSS, Playwright e2e (Chromium + WebKit) in Docker.

**Spec:** `docs/superpowers/specs/2026-09-27-jot-core-app-design.md` §6.12 (M13); it replaces §6.10 and §6.11 for the sidebar where they differ.

## Global Constraints

- Everything runs in Docker; nothing is installed on the host (host Node 18 stays untouched).
- Unit, typecheck and lint: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`.
- E2E: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e <spec> [--project chromium] [-g pattern] [--retries 0]` (the web service serves the checkout; restart it and recreate `playwright` after adding files if Vite misses them).
- Conventional commit messages, no attribution lines.
- Strings: reuse existing i18n keys (`library.heading`, `memoList.heading`, `tags.heading`, `library.collapse`, `library.expand`); any new key goes into both `en.ts` and `zh-CN.ts` with identical structure.
- Icons are inline SVG, 24×24 viewBox, 18 px, `fill="none" stroke="currentColor" strokeWidth="1.6"`, like the Settings and Trash icons.
- Test titles use typographic apostrophes (’), never straight ones.

## Review Focus

1. A long article or memo title ellipsizes inside its row, and its hover block keeps equal space on both sides (Task 1 test).
2. With a long library, the footer band stays at the bottom while the sidebar scrolls, and the last section can scroll clear of it (Task 3 test).
3. In the dark theme, the hover shade, the open article's shade, the sidebar and the footer band all stay distinct (Task 3 test).
4. The rail's page links are reachable with Tab and open their pages with Enter (Task 4 test).
5. Settings opened from the 44 px rail shows in full, not clipped by the rail (Task 4 test).

---

### Task 1: Rows — one hover background, items aligned with heading text

**Files:**
- Modify: `apps/client/src/styles/app.css` (tokens; `.section-heading`; `.library li`/`a`; `.memo-list-item`; `.tag-row`; `.tag-toggle`; `.tag-name`; `.section-empty`; `.tag-new-row .tag-name-input`)
- Test: `apps/client/e2e/sidebar.spec.ts` (two new tests; two updated)

**Interfaces:**
- Consumes: existing test ids `section-library`, `section-library-open`, `section-tags-fold`, `library-list`, `memo-list-item`, `tag-row`, `tag-name`, `tag-new`, `tag-name-input`, `memo-list-empty`.
- Produces: CSS tokens `--row-hover` and `--item-inset: 20px` (used by Tasks 3 and 4).

- [ ] **Step 1: Write the failing tests** — add to `apps/client/e2e/sidebar.spec.ts` (import `type Locator, type Page` from `@playwright/test`):

```ts
const tagRow = (page: Page, name: string) => page.locator(`[role="treeitem"] > [data-testid="tag-row"][data-tag="${name}"]`);

async function newTag(page: Page, name: string) {
  await page.getByTestId('tag-new').click();
  await page.getByTestId('tag-name-input').fill(name);
  await page.getByTestId('tag-name-input').press('Enter');
  await expect(tagRow(page, name).first()).toBeVisible();
}

/** Where an element's text starts: its left edge plus its left padding. */
const textStart = (l: Locator) => l.evaluate((el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft));

test('every sidebar row has the same hover background, equally inset on both sides (spec §6.12, Review Focus 1)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春风又绿江南岸：一个很长很长的标题，长到要在侧栏里用省略号收尾才行', '春风又绿江南岸。');
  await importText(page, 'Spring', 'Spring is here.');
  await page.getByTestId('memo-new').click();
  await newTag(page, '技巧');
  const nav = page.locator('nav.sidebar');
  const inner = await nav.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.left + el.clientWidth };
  });
  const plain = page.getByTestId('library-list').locator('li:not(.active)');
  const rows = [page.getByTestId('section-library'), plain, page.getByTestId('memo-list-item').first(), page.getByTestId('tag-row').first()];
  const colors = new Set<string>();
  for (const row of rows) {
    await row.hover();
    const box = await row.boundingBox();
    const left = (box?.x ?? 0) - inner.left;
    const right = inner.right - ((box?.x ?? 0) + (box?.width ?? 0));
    expect(Math.abs(left - right), await row.evaluate((el) => el.className)).toBeLessThanOrEqual(1);
    const bg = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    colors.add(bg);
  }
  expect(colors.size).toBe(1);
  // The long title ends in an ellipsis inside its row.
  expect(await plain.getByRole('link').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  // The open article keeps a stronger background in the same shape.
  await page.mouse.move(700, 400);
  const active = page.getByTestId('library-list').locator('li.active');
  const a = await active.boundingBox();
  expect(Math.abs((a?.x ?? 0) - inner.left - (inner.right - ((a?.x ?? 0) + (a?.width ?? 0))))).toBeLessThanOrEqual(1);
  expect(await active.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe([...colors][0]);
});

test('items start where the heading text starts; a top-level tag’s arrow hangs just left of its name (spec §6.12)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await newTag(page, '技巧');
  await newTag(page, '修辞');
  await tagRow(page, '修辞').dragTo(tagRow(page, '技巧'));
  await expect(page.locator('[role="treeitem"][aria-level="2"]')).toHaveCount(1);
  const heading = await page.getByTestId('section-library-open').evaluate((el) => el.getBoundingClientRect().left);
  const near = (x: number, target: number) => expect(Math.abs(x - target)).toBeLessThanOrEqual(1);
  near(await textStart(page.getByTestId('library-list').getByRole('link').first()), heading);
  near(await textStart(page.getByTestId('memo-list-item').first()), heading);
  const top = page.locator('[role="treeitem"][aria-level="1"] > [data-testid="tag-row"]');
  near(await textStart(top.getByTestId('tag-name')), heading);
  near(await textStart(page.locator('[role="treeitem"][aria-level="2"] > [data-testid="tag-row"]').getByTestId('tag-name')), heading + 14);
  const arrow = await top.locator('button.tag-toggle').boundingBox();
  const fold = await page.getByTestId('section-tags-fold').boundingBox();
  near((arrow?.x ?? 0) + (arrow?.width ?? 0) / 2, (fold?.x ?? 0) + (fold?.width ?? 0) / 2);
  expect((arrow?.x ?? 0) + (arrow?.width ?? 0)).toBeLessThanOrEqual(heading + 0.5);
});
```

Update the two tests that pin today's inset:

```ts
// In 'the new-tag input lines up with the tag names': compare where text starts, not box edges.
  const input = page.getByTestId('tag-name-input');
  const inputText = await input.evaluate(
    (el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft) + parseFloat(getComputedStyle(el).borderLeftWidth),
  );
  expect(Math.abs(inputText - (await textStart(page.getByTestId('tag-name').first())))).toBeLessThanOrEqual(2);

// In 'empty sections read as quietly as items, and tag names line up with article titles (spec §6.11)':
  const link = await textStart(page.getByTestId('library-list').getByRole('link').first());
  const empty = page.getByTestId('memo-list-empty');
  expect(Math.abs((await textStart(empty)) - link)).toBeLessThanOrEqual(1);
  expect(await empty.evaluate((el) => getComputedStyle(el).fontSize)).toBe('13px');
  expect(Math.abs((await textStart(page.getByTestId('tag-name').first())) - link)).toBeLessThanOrEqual(1);
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e sidebar --retries 0 -g "hover background|heading text starts"`
Expected: FAIL — the section heading's hover background is `rgba(0, 0, 0, 0)`; item text starts 12 px left of the heading text.

- [ ] **Step 3: Implement** — in `apps/client/src/styles/app.css`:

Add to `:root` (after `--font-read`; it resolves per theme because it mixes the theme's own tokens):

```css
  /* A row's hover shade, between the panel and the open row's --bg (spec §6.12). */
  --row-hover: color-mix(in srgb, var(--bg) 55%, var(--panel));
  /* Items start where a section heading's text starts: its 18 px fold arrow plus a 2 px gap. */
  --item-inset: 20px;
```

Replace these rules:

```css
.library li { display: flex; align-items: center; border-radius: 6px; }
.library li:hover { background: var(--row-hover); }
.library li.active { background: var(--bg); }
.library a { flex: 1; min-width: 0; padding: 6px 8px 6px var(--item-inset); color: inherit; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.tag-row:hover { background: var(--row-hover); }
/* A tag's fold arrow sits in the inset before its name, where a section heading's arrow is (spec §6.12). */
.tag-toggle { position: absolute; top: 50%; width: 18px; padding: 0; text-align: center; transform: translateY(-50%); }
.tag-name { flex: 1; min-width: 0; text-align: left; border: none; background: none; padding: 4px 8px 4px var(--item-inset); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.memo-list-item { display: flex; flex-direction: column; align-items: flex-start; width: 100%; min-width: 0; padding: 6px 8px 6px var(--item-inset); text-align: left; color: inherit; background: none; border: none; border-radius: 6px; cursor: pointer; }
.memo-list-item:hover { background: var(--row-hover); }

.section-heading { display: flex; align-items: center; gap: 2px; margin-top: 8px; padding: 2px 0; border-radius: 6px; }
.section-heading:hover { background: var(--row-hover); }
.section-empty { margin: 0; padding: 2px 8px 6px var(--item-inset); font-size: 13px; color: var(--muted); }
/* The input's text starts where tag names start: its padding (6 px) and border (1 px) sit inside the inset. */
.tag-new-row .tag-name-input { flex: 1; margin-left: calc(var(--item-inset) - 7px); }
```

(`.tag-toggle` is absolutely placed at its row's content start — after the row's `depth × 14 px` padding — so a top-level arrow lines up with the section fold arrows and a child's steps in with its row.)

- [ ] **Step 4: Run the sidebar tests**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e sidebar tagtree --retries 0`
Expected: PASS on Chromium and WebKit.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/styles/app.css apps/client/e2e/sidebar.spec.ts
git commit -m "feat(client): sidebar rows share one symmetric hover background, and items align with heading text"
```

---

### Task 2: Folding — all folded stays at the top; room above the footer

**Files:**
- Modify: `apps/client/src/components/Sidebar.tsx` (the `dockFrom` rule)
- Modify: `apps/client/src/styles/app.css` (`.sidebar-sections`)
- Test: `apps/client/e2e/sidebar.spec.ts`

**Interfaces:**
- Consumes: test ids `section-library-fold`, `section-memos-fold`, `section-tags-fold`, `section-library`, `section-tags`; the search box, the sidebar's first input (`nav.sidebar input`).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test, and tighten the docking one**

```ts
test('when every section is folded they sit at the top, under the search box (spec §6.12)', async ({ page }) => {
  await openApp(page);
  for (const s of ['library', 'memos', 'tags']) await page.getByTestId(`section-${s}-fold`).click();
  const search = await page.locator('nav.sidebar input').first().boundingBox();
  const library = await page.getByTestId('section-library').boundingBox();
  expect((library?.y ?? 999) - ((search?.y ?? 0) + (search?.height ?? 0))).toBeLessThan(32);
  const tags = await page.getByTestId('section-tags').boundingBox();
  const footer = await page.locator('nav.sidebar footer').boundingBox();
  expect((footer?.y ?? 0) - ((tags?.y ?? 0) + (tags?.height ?? 0))).toBeGreaterThan(200);
});
```

In 'folded sections at the end stack at the bottom; a folded middle section stays in place (Review Focus 3)', replace both `toBeLessThan(24)` checks against the footer with a band that requires room:

```ts
  const gap = (await footerTop()) - ((tags?.y ?? 0) + (tags?.height ?? 0));
  expect(gap).toBeGreaterThanOrEqual(12);
  expect(gap).toBeLessThan(40);
```

(and the same after memos is folded too).

- [ ] **Step 2: Run to see them fail**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e sidebar --retries 0 -g "folded"`
Expected: FAIL — all folded sections sit at the bottom; the docked gap is under 12 px.

- [ ] **Step 3: Implement**

In `Sidebar.tsx`:

```ts
  // Folded sections at the end stack at the bottom, above the footer; a folded middle one stays put (spec §6.11).
  // When all three are folded they stay at the top (spec §6.12).
  const allFolded = libraryFolded && memosFolded && tagsFolded;
  const dockFrom = allFolded ? null : tagsFolded ? (memosFolded ? 'memos' : 'tags') : null;
```

In `app.css`:

```css
.sidebar-sections { flex: 1 0 auto; display: flex; flex-direction: column; gap: 10px; padding-bottom: 16px; }
```

- [ ] **Step 4: Run the sidebar tests**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e sidebar --retries 0`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/Sidebar.tsx apps/client/src/styles/app.css apps/client/e2e/sidebar.spec.ts
git commit -m "feat(client): folded sidebar sections stay at the top when all are folded, with room above the footer"
```

---

### Task 3: The footer band, holding Settings, Trash and the sidebar toggle

**Files:**
- Modify: `apps/client/src/components/Sidebar.tsx` (header keeps only the title; footer band gets the toggle)
- Modify: `apps/client/src/styles/app.css` (`.sidebar` padding; `.sidebar-footer`; `--footer-band` in both themes; `.sidebar-toggle`)
- Test: `apps/client/e2e/sidebar.spec.ts`

**Interfaces:**
- Consumes: `--row-hover` (Task 1); test ids `settings-open`, `trash-open`, `sidebar-toggle`.
- Produces: `<footer className="sidebar-footer">` and `.sidebar-toggle` (Task 4 reuses both in the rail); token `--footer-band`.

- [ ] **Step 1: Write the failing tests**

```ts
test('Settings, Trash and the sidebar toggle share a footer band across the bottom (spec §6.12)', async ({ page }) => {
  await openApp(page);
  const nav = page.locator('nav.sidebar');
  const band = nav.locator('footer.sidebar-footer');
  await expect(nav.locator('header').getByTestId('sidebar-toggle')).toHaveCount(0);
  for (const id of ['settings-open', 'trash-open', 'sidebar-toggle']) await expect(band.getByTestId(id)).toBeVisible();
  const n = await nav.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, w: el.clientWidth, bottom: r.bottom, bg: getComputedStyle(el).backgroundColor };
  });
  const b = await band.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return { x: r.left, w: r.width, bottom: r.bottom, bg: c.backgroundColor, line: c.borderTopWidth };
  });
  expect(Math.abs(b.x - n.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(b.w - n.w)).toBeLessThanOrEqual(1);
  expect(Math.abs(b.bottom - n.bottom)).toBeLessThanOrEqual(1);
  expect(b.bg).not.toBe(n.bg);
  expect(b.line).toBe('1px');
});

test('with a long library the footer band stays at the bottom, and the last section scrolls clear of it (Review Focus 2)', async ({ page }) => {
  await openApp(page);
  for (let i = 0; i < 22; i++) await importText(page, `文章${i}`, `第${i}篇。`);
  const nav = page.locator('nav.sidebar');
  await nav.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const navBox = await nav.boundingBox();
  const band = await nav.locator('footer.sidebar-footer').boundingBox();
  expect(Math.abs((band?.y ?? 0) + (band?.height ?? 0) - ((navBox?.y ?? 0) + (navBox?.height ?? 0)))).toBeLessThanOrEqual(1);
  const last = await page.getByTestId('section-tags').locator('xpath=..').boundingBox();
  expect((last?.y ?? 0) + (last?.height ?? 0)).toBeLessThanOrEqual((band?.y ?? 0) - 12);
});

test('in the dark theme the hover, open-row, sidebar and footer shades stay distinct (Review Focus 3)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await importText(page, 'Spring', 'Spring is here.');
  const plain = page.getByTestId('library-list').locator('li:not(.active)');
  await plain.hover();
  const bg = (sel: Locator) => sel.evaluate((el) => getComputedStyle(el).backgroundColor);
  const shades = [
    await bg(plain),
    await bg(page.getByTestId('library-list').locator('li.active')),
    await bg(page.locator('nav.sidebar')),
    await bg(page.locator('nav.sidebar footer.sidebar-footer')),
  ];
  expect(new Set(shades).size).toBe(4);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e sidebar --retries 0 -g "footer band|footer shades"`
Expected: FAIL — the toggle is in the header; there is no `footer.sidebar-footer`.

- [ ] **Step 3: Implement**

In `Sidebar.tsx`, the expanded branch:

```tsx
    <nav className="sidebar">
      <header>
        <h1>Jot</h1>
      </header>
      {/* The search box and the sections stay as they are between the header and the footer. */}
      <footer className="sidebar-footer">
        <SettingsMenu />
        <TrashButton />
        <button type="button" className="icon sidebar-toggle" onClick={onToggle} aria-label={t('library.collapse')} title={t('library.collapse')} data-testid="sidebar-toggle">
          ‹
        </button>
      </footer>
    </nav>
```

In `app.css`, add `--footer-band` to both themes:

```css
  /* :root */ --footer-band: #ebe8e1;   /* a step darker than --panel #f3f1ec */
  /* dark */  --footer-band: #171614;   /* darker than --bg #1b1a18, well apart from the dark --row-hover (≈ #1f1e1c) */
```

and replace `.sidebar` / `.sidebar footer`:

```css
/* No bottom padding: the footer band reaches the sidebar's bottom edge (spec §6.12). */
.sidebar { width: 260px; flex: none; display: flex; flex-direction: column; gap: 10px; padding: 16px 16px 0; overflow: auto; background: var(--panel); border-right: 1px solid var(--line); }
/* The footer band: always at the bottom, across the sidebar's full width. */
.sidebar-footer {
  position: sticky; bottom: 0; z-index: 2; margin: auto -16px 0; padding: 6px 12px;
  display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--muted);
  background: var(--footer-band); border-top: 1px solid var(--line);
}
/* One height for every control in the band, so the toggle sits at the same height open and collapsed. */
.sidebar-footer .icon, .sidebar-footer .settings-toggle, .sidebar-footer .trash-open { height: 28px; display: inline-flex; align-items: center; justify-content: center; }
.sidebar-toggle { margin-left: auto; }
```

(Keep `.settings` and `.settings-menu` as they are; the menu still opens upward from the gear.)

- [ ] **Step 4: Run the sidebar and shell tests**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e sidebar shell --retries 0`
Expected: PASS (shell's 'collapses and restores the library sidebar' still finds `sidebar-toggle`).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/Sidebar.tsx apps/client/src/styles/app.css apps/client/e2e/sidebar.spec.ts
git commit -m "feat(client): a footer band holds Settings, Trash and the sidebar toggle"
```

---

### Task 4: The collapsed rail

**Files:**
- Modify: `apps/client/src/components/Sidebar.tsx` (prop `page`; collapsed branch becomes the rail)
- Modify: `apps/client/src/components/Shell.tsx` (pass `page={route.name}`)
- Modify: `apps/client/src/styles/app.css` (`.sidebar.collapsed`, `.sidebar-rail`, `.rail-link`, collapsed footer)
- Modify: `README.md` (one sentence on the rail and footer band)
- Test: `apps/client/e2e/sidebar.spec.ts`

**Interfaces:**
- Consumes: `.sidebar-footer`, `.sidebar-toggle` (Task 3); `--row-hover` (Task 1); `routeHash`, `Route` from `../router`.
- Produces: `SidebarProps.page: Route['name']`; test ids `rail-library`, `rail-memos`, `rail-tags`.

- [ ] **Step 1: Write the failing tests**

```ts
test('the collapsed sidebar is a rail: Library, Memos and Tags open their pages, and the page on show is marked (spec §6.12)', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('sidebar-toggle').click();
  const rail = page.locator('nav.sidebar.collapsed');
  for (const [id, name, pageId] of [
    ['rail-library', 'Library', 'library-page'],
    ['rail-memos', 'Memos', 'memos-page'],
    ['rail-tags', 'Tags', 'tags-page'],
  ] as const) {
    const link = rail.getByTestId(id);
    await expect(link).toHaveAccessibleName(name);
    await link.click();
    await expect(page.getByTestId(pageId)).toBeVisible();
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(rail.locator('[aria-current="page"]')).toHaveCount(1);
  }
  for (const id of ['settings-open', 'trash-open', 'sidebar-toggle']) await expect(rail.locator('footer.sidebar-footer').getByTestId(id)).toBeVisible();
});

test('the sidebar toggle sits at the same height, open or collapsed (spec §6.12)', async ({ page }) => {
  await openApp(page);
  const toggle = page.getByTestId('sidebar-toggle');
  const open = await toggle.boundingBox();
  await toggle.click();
  await expect(page.locator('nav.sidebar.collapsed')).toBeVisible();
  const collapsed = await toggle.boundingBox();
  expect(Math.abs((collapsed?.y ?? 0) - (open?.y ?? 99))).toBeLessThanOrEqual(1);
  expect(Math.abs((collapsed?.height ?? 0) - (open?.height ?? 99))).toBeLessThanOrEqual(1);
  await toggle.click();
  await expect(page.locator('nav.sidebar:not(.collapsed)')).toBeVisible();
  expect(Math.abs(((await toggle.boundingBox())?.y ?? 0) - (open?.y ?? 99))).toBeLessThanOrEqual(1);
});

test('the rail works from the keyboard, and its Settings menu shows in full (Review Focus 4, 5)', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('sidebar-toggle').click();
  await page.getByTestId('rail-library').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('rail-memos')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('memos-page')).toBeVisible();
  await page.getByTestId('settings-open').click();
  const menu = page.getByTestId('settings-menu');
  await expect(menu).toBeVisible();
  const m = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(m?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((m?.y ?? -1) >= 0 && (m?.x ?? 0) + (m?.width ?? 0) <= (viewport?.width ?? 0)).toBe(true);
  // Its right part, beyond the 44 px rail, is on top: the rail doesn't clip it.
  const onTop = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="settings-menu"]') !== null,
    [(m?.x ?? 0) + (m?.width ?? 0) - 12, (m?.y ?? 0) + (m?.height ?? 0) / 2],
  );
  expect(onTop).toBe(true);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e sidebar --retries 0 -g "rail|same height"`
Expected: FAIL — the collapsed sidebar has no rail links, and its toggle sits at the top.

- [ ] **Step 3: Implement**

`Shell.tsx`: pass the current page: `<Sidebar … page={route.name} />`.

`Sidebar.tsx`:

```tsx
import { routeHash, type Route } from '../router';

interface SidebarProps {
  /* …existing… */
  /** The page on show, so the collapsed rail can mark it. */
  page: Route['name'];
}

const svg = (d: string) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

/** The collapsed rail's pages (spec §6.12), with thin-line icons like Settings and Trash. */
const RAIL = [
  { name: 'library', label: 'library.heading', icon: svg('M6.5 3.5h7l4 4v13h-11zM13.5 3.5v4h4M9 12h6M9 15.5h6') },
  { name: 'memos', label: 'memoList.heading', icon: svg('M5 4.5h11v15H5zM8 8.5h5M8 12h5M8 15.5h3M18.5 9.5l1.5 1.5-5.5 5.5h-1.5V15z') },
  { name: 'tags', label: 'tags.heading', icon: svg('M3.5 12.5v-8h8l9 9-8 8zM8.5 8.5h.01') },
] as const;
```

The collapsed branch:

```tsx
  if (collapsed) {
    return (
      <nav className="sidebar collapsed">
        <div className="sidebar-rail">
          {RAIL.map((item) => (
            <a
              key={item.name}
              className={page === item.name ? 'icon rail-link active' : 'icon rail-link'}
              href={routeHash({ name: item.name })}
              aria-label={t(item.label)}
              title={t(item.label)}
              aria-current={page === item.name ? 'page' : undefined}
              data-testid={`rail-${item.name}`}
            >
              {item.icon}
            </a>
          ))}
        </div>
        <footer className="sidebar-footer">
          <SettingsMenu />
          <TrashButton />
          <button type="button" className="icon sidebar-toggle" onClick={onToggle} aria-label={t('library.expand')} title={t('library.expand')} data-testid="sidebar-toggle">
            ›
          </button>
        </footer>
      </nav>
    );
  }
```

`app.css`:

```css
/* The collapsed rail: page links at the top, the same footer band at the bottom (spec §6.12). It doesn't scroll,
   so it can let the Settings menu reach past its 44 px. */
.sidebar.collapsed { width: 44px; padding: 8px 0 0; align-items: stretch; overflow: visible; }
.sidebar-rail { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.rail-link { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border-radius: 6px; color: var(--muted); }
.rail-link:hover { background: var(--row-hover); }
.rail-link.active { background: var(--bg); color: var(--text); }
/* Stacked, the toggle lowest: the band's bottom padding and 28 px rows put it where it sits when open. */
.sidebar.collapsed .sidebar-footer { margin: auto 0 0; padding: 6px 0; flex-direction: column; }
.sidebar.collapsed .sidebar-toggle { margin-left: 0; }
```

`README.md` (after the sentence on the sidebar sections): "Settings, Trash and the collapse arrow sit in the band at the bottom; collapsed, the sidebar keeps a narrow rail with Library, Memos and Tags one click away."

- [ ] **Step 4: Run the sidebar, shell and pages tests**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e sidebar shell pages --retries 0`
Expected: PASS on Chromium and WebKit.

- [ ] **Step 5: Full verification and commit**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'` — Expected: all pass.
Run: the full e2e suite — Expected: all pass (15 known skips).
Then take before/after screenshots of the sidebar (open, hover, all folded, collapsed) for the product owner.

```bash
git add apps/client/src/components/Sidebar.tsx apps/client/src/components/Shell.tsx apps/client/src/styles/app.css apps/client/e2e/sidebar.spec.ts README.md
git commit -m "feat(client): the collapsed sidebar is a rail of page links above the footer band"
```
