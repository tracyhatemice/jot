// @vitest-environment happy-dom
import type { MarkupView } from '@jot/db';
import { describe, expect, it } from 'vitest';
import { buildDecorations, markupIdsAt } from './decorations';
import { blocksToDoc } from './schema';

// Canonical text: '他用比喻写春天。\n\n她笑😀了。' — the second block starts at offset 10, 😀 is [12, 14).
const doc = blocksToDoc([
  { k: 'p', runs: [{ t: '他用比喻写春天。' }] },
  { k: 'p', runs: [{ t: '她笑😀了。' }] },
]);

const markup = (id: string, kind: MarkupView['kind'], start: number, end: number, status: MarkupView['status'] = 'exact'): MarkupView => ({
  id,
  kind,
  style: 'default',
  anchorId: `a-${id}`,
  start,
  end,
  exact: '',
  status,
});

const spans = (markups: MarkupView[]) =>
  buildDecorations(doc, markups)
    .find()
    .map((d) => ({ id: (d.spec as { markupId: string }).markupId, from: d.from, to: d.to }))
    .sort((a, b) => a.from - b.from || a.id.localeCompare(b.id));

describe('buildDecorations', () => {
  it('draws term and line markups as inline ranges at offset + 1', () => {
    expect(spans([markup('t', 'term', 2, 4), markup('l', 'line', 0, 8)])).toEqual([
      { id: 'l', from: 1, to: 9 },
      { id: 't', from: 3, to: 5 },
    ]);
  });

  it('keeps overlapping markups and astral characters (Review Focus 3)', () => {
    expect(spans([markup('a', 'term', 2, 6), markup('b', 'term', 4, 8), markup('e', 'term', 12, 14)])).toEqual([
      { id: 'a', from: 3, to: 7 },
      { id: 'b', from: 5, to: 9 },
      { id: 'e', from: 13, to: 15 },
    ]);
  });

  it('draws a paragraph markup on every block it covers', () => {
    expect(spans([markup('p', 'paragraph', 0, 16)])).toEqual([
      { id: 'p', from: 0, to: 10 },
      { id: 'p', from: 10, to: 18 },
    ]);
  });

  it('skips orphans and empty ranges, and clamps to the text', () => {
    expect(spans([markup('o', 'term', 2, 4, 'orphan'), markup('z', 'term', 3, 3), markup('x', 'term', 14, 99)])).toEqual([
      { id: 'x', from: 15, to: 17 },
    ]);
  });
});

describe('markupIdsAt', () => {
  it('collects ids from the element and its ancestors inside the root', () => {
    document.body.innerHTML =
      '<div id="root"><p class="mk mk-paragraph mk-id-p1"><span class="mk mk-term mk-id-a mk-id-b">绿</span>x</p></div>';
    const root = document.getElementById('root') as HTMLElement;
    expect(markupIdsAt(root.querySelector('span') as Element, root).sort()).toEqual(['a', 'b', 'p1']);
    expect(markupIdsAt(root, root)).toEqual([]);
  });
});
