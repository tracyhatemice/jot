import { expect, type Page } from '@playwright/test';

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
