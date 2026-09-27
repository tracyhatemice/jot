import { expect, test } from '@playwright/test';
import { fillLarge, importText, openApp } from './helpers';

test('imports pasted Chinese text and opens it', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('import-open').click();
  await page.getByTestId('import-text').fill('　　春天来了。\n　　燕子飞回来了。\n　　柳树发芽了。');
  await expect(page.getByTestId('import-count')).toContainText('3');
  await page.getByTestId('import-title').fill('春');
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('article-title')).toHaveText('春');
  await expect(page.getByTestId('library-list')).toContainText('春');
  await expect(page.getByTestId('article-view')).toContainText('燕子飞回来了。');
});

test('imports a Markdown file with its heading as the title', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('import-open').click();
  await page.getByTestId('import-file').setInputFiles({
    name: 'guxiang.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# 故乡\n\n我冒了严寒，回到相隔二千余里的故乡去。'),
  });
  await expect(page.getByTestId('import-title')).toHaveValue('故乡');
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('article-title')).toHaveText('故乡');
});

test('imports a GBK-encoded .txt file without garbling it', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('import-open').click();
  await page.getByTestId('import-file').setInputFiles({
    name: 'gbk.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from([0xb4, 0xba, 0xcc, 0xec, 0xc0, 0xb4, 0xc1, 0xcb]), // 春天来了 in GBK
  });
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('article-view')).toHaveText('春天来了');
});

test('keeps pasted HTML structure and never runs its scripts (Review Focus 1)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit ignores clipboardData in synthetic paste events');
  await openApp(page);
  await page.getByTestId('import-open').click();
  await page.getByTestId('import-text').evaluate((el) => {
    const data = new DataTransfer();
    data.setData('text/html', '<p>安全的<b>文字</b></p><img src="x" onerror="window.__pwned=1"><script>window.__pwned=1</script>');
    data.setData('text/plain', '安全的文字');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByTestId('import-count')).toContainText('1');
  await page.getByTestId('import-title').fill('HTML');
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('article-view')).toContainText('安全的文字');
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

test('refuses to import nothing and unsupported files (Review Focus 5)', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('import-open').click();
  await page.getByTestId('import-text').fill('   \n  ');
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('import-error')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles({ name: 'essay.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await expect(page.getByTestId('import-error')).toBeVisible();
  await page.getByTestId('import-cancel').click();
  await expect(page.getByTestId('library-empty')).toBeVisible();
});

test('imports and opens a very long article quickly (Review Focus 4)', async ({ page }) => {
  await openApp(page);
  const text = Array.from({ length: 8000 }, (_, i) => `第${i}段：春风又绿江南岸，明月何时照我还。`).join('\n\n');
  await page.getByTestId('import-open').click();
  await page.getByTestId('import-title').fill('长文');
  await fillLarge(page.getByTestId('import-text'), text);
  const started = Date.now();
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('article-title')).toHaveText('长文', { timeout: 20_000 });
  await expect(page.getByTestId('article-view')).toContainText('第7999段', { timeout: 20_000 });
  expect(Date.now() - started).toBeLessThan(5_000);
});

test('keeps imported articles after a reload', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await openApp(page, { memory: false });
  await importText(page, '留存', '这篇文章应该在刷新后仍然存在。');
  await page.reload();
  await expect(page.getByTestId('article-title')).toHaveText('留存', { timeout: 30_000 });
});
