import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the app. `memory` uses the dev-only in-memory library (Playwright's WebKit has no OPFS). */
export async function openApp(page: Page, { memory = true }: { memory?: boolean } = {}): Promise<void> {
  await page.goto(memory ? '/?storage=memory#/' : '/#/');
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
}

export async function importText(page: Page, title: string, text: string): Promise<void> {
  await page.getByTestId('import-open').click();
  await page.getByTestId('import-title').fill(title);
  await page.getByTestId('import-text').fill(text);
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('article-title')).toHaveText(title);
}

/**
 * Selects the `occurrence`-th `needle` in the article view and reports it like a mouse selection.
 * The needle may cross text nodes (highlights split text) but not paragraphs.
 */
export async function selectText(page: Page, needle: string, occurrence = 0): Promise<void> {
  await page.getByTestId('article-view').evaluate(
    (root, [n, occ]) => {
      const nodes: Text[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
      const all = nodes.map((t) => t.data).join('');
      let at = -1;
      for (let i = 0; i <= occ; i++) at = all.indexOf(n, at + 1);
      if (at < 0) throw new Error(`text not found in article: ${n}`);
      const locate = (offset: number): [Text, number] => {
        let rest = offset;
        for (const t of nodes) {
          if (rest <= t.data.length) return [t, rest];
          rest -= t.data.length;
        }
        const last = nodes[nodes.length - 1];
        return [last, last.data.length];
      };
      const [startNode, startOffset] = locate(at);
      const [endNode, endOffset] = locate(at + n.length);
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      const selection = window.getSelection() as Selection;
      selection.removeAllRanges();
      selection.addRange(range);
      root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    },
    [needle, occurrence] as const,
  );
}

/**
 * Sets a large textarea value the way a paste would (native setter + input event, which React sees).
 * Playwright's `fill` slows down superlinearly on long text: 60k characters take ~20 s even on a bare textarea.
 */
export async function fillLarge(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

/** Adds a tag (picking an existing one, or creating it) to the item whose tag chips have the test id `area`. */
export async function addTag(page: Page, area: string, name: string): Promise<void> {
  await page.getByTestId(area).getByTestId('tag-add').click();
  await page.getByTestId('tag-input').fill(name);
  await page.getByTestId('tag-input').press('Enter');
}

/**
 * Brings back the article bar, which hides while scrolling down (spec §6.10), as a writer does: by pointing
 * at the top of the column. Clicking the hidden bar instead would make Playwright scroll it into view.
 */
export async function revealArticleBar(page: Page): Promise<void> {
  const box = await page.locator('main.reader').boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + 8);
  const bar = page.getByTestId('article-bar');
  await expect(bar).toHaveAttribute('data-shown', 'true');
  // Wait for it to finish sliding in: clicking it half-way would make Playwright scroll it into view.
  await expect.poll(async () => ((await bar.boundingBox())?.y ?? -100) - (box?.y ?? 0)).toBeGreaterThanOrEqual(-0.5);
}

/**
 * Clicks with the mouse where the element is on screen. Playwright's own click first scrolls the element
 * "into view", which for a button in a sticky bar can scroll the column even though the bar is visible.
 */
export async function clickInPlace(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error('element not rendered');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Starts fix-up mode from the article's ☰ menu (spec §6.10), leaving the page where it is. */
export async function startFixing(page: Page): Promise<void> {
  await revealArticleBar(page);
  await clickInPlace(page, page.getByTestId('article-menu'));
  await clickInPlace(page, page.getByTestId('edit-start'));
}

/** Moves an article to the Trash from its ☰ menu; the caller's dialog handler accepts the confirmation. */
export async function deleteArticle(page: Page, title: string): Promise<void> {
  await page.getByTestId('library-list').getByRole('link', { name: title }).click();
  await expect(page.getByTestId('article-title')).toHaveText(title);
  await page.getByTestId('article-menu').click();
  await page.getByTestId('article-delete').click();
}
