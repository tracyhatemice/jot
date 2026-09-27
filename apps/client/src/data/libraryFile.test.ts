// @vitest-environment happy-dom
import { captureAnchor } from '@jot/core';
import { appendMemoUpdate, createArticle, createMemo, createQuote, getArticle, Library, listBacklinks, search } from '@jot/db';
import { createNodeDriver } from '@jot/db/testing/node';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { AnchorLink } from '../memo/anchorLink';
import { exportFileName, exportLibraryText, importLibraryText } from './libraryFile';

describe('library file', () => {
  it('names files by kind and local time', () => {
    const d = new Date(2026, 8, 27, 9, 5);
    expect(exportFileName('library', d)).toBe('jot-library-20260927-0905.json');
    expect(exportFileName('backup', d)).toBe('jot-backup-20260927-0905.sqlite');
  });

  it('carries memos across, rebuilding their links and searchable text from their documents (Review Focus 4)', async () => {
    const a = await Library.open(createNodeDriver());
    const { articleId, revisionId } = await createArticle(a, { title: '春', importKind: 'paste', blocks: [{ k: 'p', runs: [{ t: '他用比喻写春天。' }] }] });
    const text = (await getArticle(a, articleId))!.text;
    const quoteId = await createQuote(a, { articleId, revisionId, anchor: captureAnchor(text, 2, 4) });
    const memoId = await createMemo(a, { title: '札记', homeArticleId: articleId });
    const doc = new Y.Doc();
    prosemirrorJSONToYXmlFragment(
      getSchema([StarterKit, AnchorLink]),
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '论' },
              { type: 'anchorLink', attrs: { linkId: 'l1', targetType: 'anchor', targetId: quoteId, articleId, label: '比喻' } },
            ],
          },
        ],
      },
      doc.getXmlFragment('default'),
    );
    // The derived data is left empty on purpose: the import must rebuild it from the document.
    await appendMemoUpdate(a, memoId, Y.encodeStateAsUpdate(doc), { text: '', links: [] });

    const b = await Library.open(createNodeDriver());
    expect(await importLibraryText(b, await exportLibraryText(a))).toMatchObject({ articles: 1, memos: 1 });
    expect((await search(b.driver, { text: '论比喻', types: ['memo'] })).map((h) => h.entityId)).toEqual([memoId]);
    expect((await listBacklinks(b, articleId)).map((l) => l.memoId)).toEqual([memoId]);
  });
});
