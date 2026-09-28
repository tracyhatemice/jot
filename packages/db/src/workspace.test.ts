import type { Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, deleteArticle, EmptyTitleError, getArticle, updateArticleDetails } from './articles';
import { Library } from './library';
import { createMemo, getMemo, listMemos, setMemoHome } from './memos';
import { search } from './search';
import { createTag, tagEntity, tagUsage } from './tags';
import { eraseTrashEntries } from './trash';

const paras = (...texts: string[]): Block[] => texts.map((t) => ({ k: 'p', runs: [{ t }] }));
let tick = 1000;
const open = () => Library.open(createNodeDriver(), { now: () => tick++ });
const article = async (lib: Library, title: string, text = '他用比喻写春天。') =>
  (await createArticle(lib, { title, author: '甲', importKind: 'paste', blocks: paras(text) })).articleId;

describe('updateArticleDetails', () => {
  it('changes the title, author and source, and search finds the new title', async () => {
    const lib = await open();
    const id = await article(lib, '春');
    await updateArticleDetails(lib, id, { title: '  春之歌 ', author: '', source: 'https://example.com/spring' });
    const a = (await getArticle(lib, id))!;
    expect([a.title, a.author, a.source]).toEqual(['春之歌', null, 'https://example.com/spring']);
    expect((await search(lib.driver, { text: '春之歌' })).map((h) => [h.entityType, h.entityId])).toEqual([['article', id]]);
  });

  it('refuses a blank title and changes nothing (Review Focus 3)', async () => {
    const lib = await open();
    const id = await article(lib, '春');
    await expect(updateArticleDetails(lib, id, { title: '   ', author: null, source: null })).rejects.toThrow(EmptyTitleError);
    expect((await getArticle(lib, id))!.title).toBe('春');
  });
});

describe('setMemoHome', () => {
  it('moves a memo whose article was erased to another article (spec §10 step 8, Review Focus 2)', async () => {
    const lib = await open();
    const spring = await article(lib, '春');
    const autumn = await article(lib, '秋', '秋水共长天一色。');
    const memoId = await createMemo(lib, { title: '札记', homeArticleId: spring });
    await deleteArticle(lib, spring);
    await eraseTrashEntries(lib, [{ kind: 'article', id: spring }]);
    await setMemoHome(lib, memoId, autumn);
    expect((await listMemos(lib, autumn)).map((m) => m.id)).toEqual([memoId]);
    expect((await getMemo(lib, memoId))!.homeArticleId).toBe(autumn);
  });

  it('refuses an article that is in the Trash (Review Focus 2)', async () => {
    const lib = await open();
    const spring = await article(lib, '春');
    const autumn = await article(lib, '秋', '秋水共长天一色。');
    const memoId = await createMemo(lib, { title: '札记', homeArticleId: spring });
    await deleteArticle(lib, autumn);
    await expect(setMemoHome(lib, memoId, autumn)).rejects.toThrow('does not exist');
    expect((await getMemo(lib, memoId))!.homeArticleId).toBe(spring);
  });
});

describe('tagUsage', () => {
  it('counts the live items each tag is on', async () => {
    const lib = await open();
    const a = await createTag(lib, { name: '技巧' });
    const b = await createTag(lib, { name: '修辞' });
    const id = await article(lib, '春');
    const memoId = await createMemo(lib, { title: '札记', homeArticleId: null });
    await tagEntity(lib, { tagId: a, entityType: 'article', entityId: id, articleId: id });
    await tagEntity(lib, { tagId: a, entityType: 'memo', entityId: memoId, articleId: null });
    await tagEntity(lib, { tagId: b, entityType: 'memo', entityId: memoId, articleId: null });
    expect(await tagUsage(lib)).toEqual({ [a]: 2, [b]: 1 });
    await deleteArticle(lib, id);
    expect(await tagUsage(lib)).toEqual({ [a]: 1, [b]: 1 });
  });
});
