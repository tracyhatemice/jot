import { expect, test, type Locator, type Page } from '@playwright/test';
import { deleteArticle, importText, openApp } from './helpers';

const tagRow = (page: Page, name: string) => page.locator(`[role="treeitem"] > [data-testid="tag-row"][data-tag="${name}"]`);

async function newTag(page: Page, name: string) {
  await page.getByTestId('tag-new').click();
  await page.getByTestId('tag-name-input').fill(name);
  await page.getByTestId('tag-name-input').press('Enter');
  await expect(tagRow(page, name).first()).toBeVisible();
}

/** Where an element's text starts: its left edge plus its left padding. */
const textStart = (l: Locator) => l.evaluate((el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft));

test('sections fold and remember it; their headings open the section pages', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('section-library-fold').click();
  await expect(page.getByTestId('library-list')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('library-list')).toHaveCount(0);
  await page.getByTestId('section-library-fold').click();
  // Unfolded again; the in-memory library is empty after the reload.
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await page.getByTestId('section-memos-open').click();
  await expect(page.getByTestId('memos-page')).toBeVisible();
  await page.getByTestId('section-tags-open').click();
  await expect(page.getByTestId('tags-page')).toBeVisible();
  await page.getByTestId('section-library-open').click();
  await expect(page.getByTestId('library-page')).toBeVisible();
});

test('Library + imports; article rows have no delete button; the Trash button shows no count', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.sidebar > header').getByTestId('import-open')).toHaveCount(0);
  await expect(page.getByTestId('section-library').getByTestId('import-open')).toBeVisible();
  await importText(page, '春', '春风又绿江南岸。');
  await expect(page.getByTestId('library-list').getByRole('button')).toHaveCount(0);
  page.once('dialog', (dialog) => void dialog.accept());
  await deleteArticle(page, '春');
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(page.getByTestId('trash-open')).toBeVisible();
  await expect(page.getByTestId('trash-count')).toHaveCount(0);
});

test('the new-tag input lines up with the tag names', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tag-new').click();
  await page.getByTestId('tag-name-input').fill('技巧');
  await page.getByTestId('tag-name-input').press('Enter');
  await page.getByTestId('tag-new').click();
  // Compare where text starts, not box edges.
  const input = page.getByTestId('tag-name-input');
  const inputText = await input.evaluate(
    (el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft) + parseFloat(getComputedStyle(el).borderLeftWidth),
  );
  expect(Math.abs(inputText - (await textStart(page.getByTestId('tag-name').first())))).toBeLessThanOrEqual(2);
});

test('the Tags + unfolds the section to create a tag (review)', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('section-tags-fold').click();
  await page.getByTestId('tag-new').click();
  await expect(page.getByTestId('tag-name-input')).toBeVisible();
});

test('empty sections read as quietly as items, and tag names line up with article titles (spec §6.11)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('tag-new').click();
  await page.getByTestId('tag-name-input').fill('技巧');
  await page.getByTestId('tag-name-input').press('Enter');
  const link = await textStart(page.getByTestId('library-list').getByRole('link').first());
  const empty = page.getByTestId('memo-list-empty');
  expect(Math.abs((await textStart(empty)) - link)).toBeLessThanOrEqual(1);
  expect(await empty.evaluate((el) => getComputedStyle(el).fontSize)).toBe('13px');
  expect(Math.abs((await textStart(page.getByTestId('tag-name').first())) - link)).toBeLessThanOrEqual(1);
});

test('Memos + creates a standalone memo and opens it (spec §6.11)', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('memo-standalone-new').click();
  await expect(page.getByTestId('memo-pane')).toBeVisible();
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 1');
  await expect(page.getByTestId('memo-list-item')).toContainText('No article');
});

test('standalone memos are numbered among themselves, and a double click on either + makes one memo (review M7)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-list-item')).toHaveCount(2);
  await page.getByTestId('memo-standalone-new').dblclick();
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 1');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('memo-list-item')).toHaveCount(3);
  await page.getByTestId('memo-standalone-new').click();
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 2');
  await page.getByTestId('memo-new').dblclick();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('memo-list-item')).toHaveCount(5);
});

test('folded sections at the end stack at the bottom; a folded middle section stays in place (Review Focus 3)', async ({ page }) => {
  await openApp(page);
  const box = (id: string) => page.getByTestId(id).boundingBox();
  const footerTop = async () => (await page.locator('.sidebar footer').boundingBox())?.y ?? 0;
  // Docked at the bottom, with some room above the footer (spec §6.12).
  const roomAboveFooter = async () => {
    const tags = await box('section-tags');
    const gap = (await footerTop()) - ((tags?.y ?? 0) + (tags?.height ?? 0));
    expect(gap).toBeGreaterThanOrEqual(12);
    expect(gap).toBeLessThan(40);
  };
  await page.getByTestId('section-tags-fold').click();
  await roomAboveFooter();
  await page.getByTestId('section-memos-fold').click();
  const memos = await box('section-memos');
  const tags = await box('section-tags');
  expect((tags?.y ?? 0) - ((memos?.y ?? 0) + (memos?.height ?? 0))).toBeLessThan(24);
  await roomAboveFooter();
  await page.getByTestId('section-tags-fold').click();
  const library = await box('section-library');
  const middle = await box('section-memos');
  expect((middle?.y ?? 999) - ((library?.y ?? 0) + (library?.height ?? 0))).toBeLessThan(80);
});

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

test('rows line up with the search box, fold arrows sit outside them on the left, and nested tags step in (spec §6.12)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  for (const name of ['技巧', '修辞', '比喻']) await newTag(page, name);
  await tagRow(page, '修辞').dragTo(tagRow(page, '技巧'));
  await expect(page.locator('[role="treeitem"][aria-level="2"]')).toHaveCount(1);
  await tagRow(page, '比喻').dragTo(tagRow(page, '修辞'));
  await expect(page.locator('[role="treeitem"][aria-level="3"]')).toHaveCount(1);
  const near = (x: number, target: number) => expect(Math.abs(x - target)).toBeLessThanOrEqual(1);
  const left = async (l: Locator) => (await l.boundingBox())?.x ?? -99;
  const right = async (l: Locator) => {
    const b = await l.boundingBox();
    return (b?.x ?? 0) + (b?.width ?? 0);
  };
  const center = async (l: Locator) => {
    const b = await l.boundingBox();
    return (b?.x ?? 0) + (b?.width ?? 0) / 2;
  };
  const search = page.locator('nav.sidebar input').first();
  const edge = await left(search);
  // Heading and top-level rows line up with the search box; a section's fold arrow sits outside, on the left.
  const heading = page.getByTestId('section-library');
  near(await left(heading), edge);
  near(await right(heading), await right(search));
  expect(await right(page.getByTestId('section-library-fold'))).toBeLessThanOrEqual(edge + 0.5);
  near(await left(page.getByTestId('library-list').locator('li').first()), edge);
  near(await left(page.getByTestId('memo-list-item').first()), edge);
  const level = (n: number) => page.locator(`[role="treeitem"][aria-level="${n}"] > [data-testid="tag-row"]`);
  near(await left(level(1)), edge);
  // Text starts at the same inset in every row.
  const headingText = await left(page.getByTestId('section-library-open'));
  near(await textStart(page.getByTestId('library-list').getByRole('link').first()), headingText);
  near(await textStart(page.getByTestId('memo-list-item').first()), headingText);
  near(await textStart(level(1).getByTestId('tag-name')), headingText);
  // A tag's arrow sits outside its row, a top-level one in the section arrows' column.
  const arrow = (n: number) => level(n).locator('button.tag-toggle');
  expect(await right(arrow(1))).toBeLessThanOrEqual((await left(level(1))) + 0.5);
  near(await center(arrow(1)), await center(page.getByTestId('section-tags-fold')));
  // Each nested level's row, text and arrow step in by one indent.
  near(await left(level(2)), (await left(level(1))) + 14);
  near(await textStart(level(2).getByTestId('tag-name')), headingText + 14);
  near(await center(arrow(2)), (await center(arrow(1))) + 14);
  expect(await right(arrow(2))).toBeLessThanOrEqual((await left(level(2))) + 0.5);
  near(await left(level(3)), (await left(level(1))) + 28);
});

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
  // The mark shows: the page on show has its own background and a stronger colour.
  await page.mouse.move(700, 400);
  const look = (id: string) => rail.getByTestId(id).evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
  const [activeBg, activeColor] = await look('rail-tags');
  const [idleBg, idleColor] = await look('rail-library');
  expect(activeBg).not.toBe(idleBg);
  expect(activeColor).not.toBe(idleColor);
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

test('each section heading shows its icon, the same as in the collapsed rail (spec §6.12)', async ({ page }) => {
  await openApp(page);
  const paths: Record<string, string | null> = {};
  for (const [s, name] of [
    ['library', 'Library'],
    ['memos', 'Memos'],
    ['tags', 'Tags'],
  ] as const) {
    const link = page.getByTestId(`section-${s}-open`);
    await expect(link).toHaveAccessibleName(name);
    const icon = link.locator('svg path');
    await expect(icon).toHaveCount(1);
    paths[s] = await icon.getAttribute('d');
  }
  expect(new Set(Object.values(paths)).size).toBe(3);
  await page.getByTestId('sidebar-toggle').click();
  for (const s of ['library', 'memos', 'tags']) expect(await page.getByTestId(`rail-${s}`).locator('svg path').getAttribute('d')).toBe(paths[s]);
});
