import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface WindowConfig {
  dragDropEnabled?: boolean;
}

const config = JSON.parse(readFileSync(new URL('../../../desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8')) as {
  app: { windows: WindowConfig[] };
};

describe('desktop window config', () => {
  it('leaves drag and drop to the page, so dragging tags works in WebView2 on Windows', () => {
    // Tauri replaces WebView2's drag-and-drop handler unless this is off, which stops HTML5 drag events.
    expect(config.app.windows.map((w) => w.dragDropEnabled)).toEqual([false]);
  });
});
