// @vitest-environment happy-dom
import type { MarkupView } from '@jot/db';
import { describe, expect, it } from 'vitest';
import { annotationIdsAt, buildDecorations } from './decorations';
import { blocksToDoc } from './schema';

// Canonical text: '他用比喻写春天。\n\n她笑😀了。' — the second block starts at offset 10, 😀 is [12, 14).
const doc = blocksToDoc([
  { k: 'p', runs: [{ t: '他用比喻写春天。' }] },
  { k: 'p', runs: [{ t: '她笑😀了。' }] },
]);

const markup = (
  id: string,
  style: MarkupView['style'],
  start: number,
  end: number,
  status: MarkupView['status'] = 'exact',
  kind: MarkupView['kind'] = 'term',
): MarkupView => ({
  id,
  kind,
  style,
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
  it('draws every style as an inline range at offset + 1', () => {
    expect(spans([markup('t', 'highlight', 2, 4), markup('l', 'underline', 0, 8)])).toEqual([
      { id: 'l', from: 1, to: 9 },
      { id: 't', from: 3, to: 5 },
    ]);
  });

  it('keeps overlapping markups and astral characters (Review Focus 3)', () => {
    expect(spans([markup('a', 'bold', 2, 6), markup('b', 'highlight', 4, 8), markup('e', 'underline', 12, 14)])).toEqual([
      { id: 'a', from: 3, to: 7 },
      { id: 'b', from: 5, to: 9 },
      { id: 'e', from: 13, to: 15 },
    ]);
  });

  it('draws markups saved as whole paragraphs inline over their text', () => {
    expect(spans([markup('p', 'highlight', 0, 16, 'exact', 'paragraph')])).toEqual([{ id: 'p', from: 1, to: 17 }]);
  });

  it('skips orphans and empty ranges, and clamps to the text', () => {
    expect(spans([markup('o', 'highlight', 2, 4, 'orphan'), markup('z', 'bold', 3, 3), markup('x', 'underline', 14, 99)])).toEqual([
      { id: 'x', from: 15, to: 17 },
    ]);
  });

  it('draws citations and the flash as their own inline decorations', () => {
    const found = buildDecorations(doc, [], {
      citations: [{ start: 2, end: 4, memoIds: ['m1', 'm2'] }],
      flash: { start: 12, end: 14 },
    })
      .find()
      .map((d) => ({ from: d.from, to: d.to, spec: d.spec as object }))
      .sort((a, b) => a.from - b.from);
    expect(found).toEqual([
      { from: 3, to: 5, spec: { citedBy: ['m1', 'm2'] } },
      { from: 13, to: 15, spec: { flash: true } },
    ]);
  });
});

describe('annotationIdsAt', () => {
  it('collects markup and citing-memo ids from the element and its ancestors inside the root', () => {
    document.body.innerHTML =
      '<div id="root"><p><span class="mk mk-bold mk-id-a mk-id-b cited cite-m-memo1">绿</span>x</p></div>';
    const root = document.getElementById('root') as HTMLElement;
    const ids = annotationIdsAt(root.querySelector('span') as Element, root);
    expect(ids.markupIds.sort()).toEqual(['a', 'b']);
    expect(ids.memoIds).toEqual(['memo1']);
    expect(annotationIdsAt(root, root)).toEqual({ markupIds: [], memoIds: [] });
  });
});
