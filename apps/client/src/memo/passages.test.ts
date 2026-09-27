import { captureAnchor } from '@jot/core';
import { createArticle, createMarkup, createSideNote, getArticle, Library } from '@jot/db';
import { createNodeDriver } from '@jot/db/testing/node';
import { describe, expect, it } from 'vitest';
import { findPassages } from './passages';

describe('findPassages', () => {
  it('offers matching markups and side notes, not articles, as link targets', async () => {
    let t = 1000;
    const lib = await Library.open(createNodeDriver(), { now: () => t++ });
    const { articleId, revisionId } = await createArticle(lib, {
      title: '春',
      importKind: 'paste',
      blocks: [{ k: 'p', runs: [{ t: '春风又绿江南岸，明月何时照我还。' }] }],
    });
    const text = (await getArticle(lib, articleId))!.text;
    const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 8, 10), style: 'highlight' });
    const noteId = await createSideNote(lib, { markupId, articleId, body: '以明月寄情' });
    const found = await findPassages(lib, '明月', 'Side note');
    expect(found).toHaveLength(2);
    expect(found).toEqual(
      expect.arrayContaining([
        { targetType: 'markup', targetId: markupId, articleId, label: '明月', source: '春' },
        { targetType: 'side_note', targetId: noteId, articleId, label: '以明月寄情', source: '春' },
      ]),
    );
    expect(await findPassages(lib, '  ', 'Side note')).toEqual([]);
  });
});
