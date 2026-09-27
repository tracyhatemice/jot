import { captureAnchor } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, getArticle } from './articles';
import { Library } from './library';
import { createMarkup } from './markups';
import { createMemo } from './memos';
import { createTag, listArticleTaggings, tagEntity, untagEntity } from './tags';

describe('listArticleTaggings', () => {
  it('lists live taggings of an article and of the items in it, but not of memos or other articles', async () => {
    let t = 1000;
    const lib = await Library.open(createNodeDriver(), { now: () => t++ });
    const blocks = [{ k: 'p' as const, runs: [{ t: '他用比喻写春天。' }] }];
    const a = await createArticle(lib, { title: 'A', importKind: 'paste', blocks });
    const b = await createArticle(lib, { title: 'B', importKind: 'paste', blocks });
    const text = (await getArticle(lib, a.articleId))!.text;
    const { markupId } = await createMarkup(lib, {
      articleId: a.articleId,
      revisionId: a.revisionId,
      anchor: captureAnchor(text, 2, 4),
      style: 'bold',
    });
    const memoId = await createMemo(lib, { title: 'M', homeArticleId: a.articleId });
    const x = await createTag(lib, { name: 'x' });
    const y = await createTag(lib, { name: 'y' });
    await tagEntity(lib, { tagId: x, entityType: 'article', entityId: a.articleId, articleId: a.articleId });
    await tagEntity(lib, { tagId: y, entityType: 'markup', entityId: markupId, articleId: a.articleId });
    await tagEntity(lib, { tagId: x, entityType: 'markup', entityId: markupId, articleId: a.articleId });
    await untagEntity(lib, { tagId: x, entityType: 'markup', entityId: markupId, articleId: a.articleId });
    await tagEntity(lib, { tagId: x, entityType: 'memo', entityId: memoId, articleId: null });
    await tagEntity(lib, { tagId: y, entityType: 'article', entityId: b.articleId, articleId: b.articleId });
    expect(await listArticleTaggings(lib, a.articleId)).toEqual([
      { entityType: 'article', entityId: a.articleId, tagId: x },
      { entityType: 'markup', entityId: markupId, tagId: y },
    ]);
  });
});
