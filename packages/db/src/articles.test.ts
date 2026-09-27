import type { Block } from '@jot/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, deleteArticle, EmptyArticleError, getArticle, listArticles } from './articles';
import { Library } from './library';
import { search } from './search';

let lib: Library;
beforeEach(async () => {
  let t = 1000;
  lib = await Library.open(createNodeDriver(), { now: () => t++ });
});

const paragraphs = (...texts: string[]): Block[] => texts.map((t) => ({ k: 'p', runs: [{ t }] }));

describe('articles', () => {
  it('creates articles and lists them newest first', async () => {
    const a = await createArticle(lib, { title: '故乡', author: '鲁迅', importKind: 'paste', blocks: paragraphs('我冒了严寒。') });
    const b = await createArticle(lib, { title: 'Second', importKind: 'txt', blocks: paragraphs('Hello.') });
    const list = await listArticles(lib);
    expect(list.map((x) => x.id)).toEqual([b.articleId, a.articleId]);
    expect(list[1]).toMatchObject({ title: '故乡', author: '鲁迅', lang: 'zh' });
  });

  it('returns the current revision with normalized blocks and canonical text', async () => {
    const { articleId, revisionId } = await createArticle(lib, {
      title: 'T',
      importKind: 'paste',
      blocks: paragraphs(' 第一段。 ', '', '第二段。'),
    });
    const article = await getArticle(lib, articleId);
    expect(article).toMatchObject({ id: articleId, revisionId, text: '第一段。\n\n第二段。' });
    expect(article?.blocks).toEqual(paragraphs('第一段。', '第二段。'));
  });

  it('derives a title from the first paragraph when none is given', async () => {
    const long = '春'.repeat(50);
    const { articleId } = await createArticle(lib, { title: '   ', importKind: 'paste', blocks: paragraphs(long) });
    expect((await getArticle(lib, articleId))?.title).toBe(`${'春'.repeat(40)}…`);
  });

  it('rejects an article with no text (Review Focus 5)', async () => {
    await expect(createArticle(lib, { title: 'x', importKind: 'paste', blocks: paragraphs('  ', '') })).rejects.toBeInstanceOf(
      EmptyArticleError,
    );
    expect(await listArticles(lib)).toEqual([]);
  });

  it('makes the article searchable by title and body', async () => {
    const { articleId } = await createArticle(lib, { title: '春天', importKind: 'paste', blocks: paragraphs('他用比喻写景。') });
    expect((await search(lib.driver, { text: '比喻' })).map((h) => h.entityId)).toEqual([articleId]);
    expect((await search(lib.driver, { text: '春天' })).map((h) => h.entityId)).toEqual([articleId]);
  });

  it('deletes an article from the list, from lookups and from search', async () => {
    const { articleId } = await createArticle(lib, { title: '春天', importKind: 'paste', blocks: paragraphs('他用比喻写景。') });
    await deleteArticle(lib, articleId);
    expect(await listArticles(lib)).toEqual([]);
    expect(await getArticle(lib, articleId)).toBeNull();
    expect(await search(lib.driver, { text: '比喻' })).toEqual([]);
  });
});
