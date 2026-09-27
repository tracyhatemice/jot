import { tagEdgeId, taggingId, type EntityType } from '@jot/core';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { Library } from './library';
import { indexStatements, search, unindexStatements, type SearchDoc, type SearchParams } from './search';

let lib: Library;
beforeEach(async () => {
  lib = await Library.open(createNodeDriver());
});

const index = (doc: SearchDoc) => lib.driver.batch(indexStatements(doc));
const ids = async (p: SearchParams) => (await search(lib.driver, p)).map((h) => `${h.entityType}:${h.entityId}`).sort();
const edge = (parent: string, child: string, deleted = 0) =>
  lib.commit([{ table: 'tag_edge', id: tagEdgeId(parent, child), fields: { parent_id: parent, child_id: child, deleted } }]);
const tag = (tagId: string, entityType: EntityType, entityId: string, articleId: string | null, deleted = 0) =>
  lib.commit([
    {
      table: 'tagging',
      id: taggingId(tagId, entityType, entityId),
      fields: { tag_id: tagId, entity_type: entityType, entity_id: entityId, article_id: articleId, created_at: 1, deleted },
    },
  ]);

async function seed() {
  await index({ entityType: 'article', entityId: 'a1', articleId: 'a1', title: '春', body: '他用比喻写春天。' });
  await index({ entityType: 'markup', entityId: 'm1', articleId: 'a1', title: '', body: '比喻' });
  await index({ entityType: 'side_note', entityId: 'n1', articleId: 'a1', title: '', body: '这里的比喻很妙' });
  await index({ entityType: 'memo', entityId: 'memo1', articleId: null, title: 'Notes on metaphor', body: 'Writers use metaphor.' });
}

describe('search', () => {
  it('finds a 2-character Chinese query across entity types', async () => {
    await seed();
    expect(await ids({ text: '比喻' })).toEqual(['article:a1', 'markup:m1', 'side_note:n1']);
  });

  it('finds English words by prefix', async () => {
    await seed();
    expect(await ids({ text: 'metaph' })).toEqual(['memo:memo1']);
  });

  it('filters by entity type', async () => {
    await seed();
    expect(await ids({ text: '比喻', types: ['markup', 'side_note'] })).toEqual(['markup:m1', 'side_note:n1']);
  });

  it('ranks title hits above body hits', async () => {
    await index({ entityType: 'memo', entityId: 'body', articleId: null, title: 'x', body: 'metaphor' });
    await index({ entityType: 'memo', entityId: 'title', articleId: null, title: 'metaphor', body: 'x' });
    const hits = await search(lib.driver, { text: 'metaphor' });
    expect(hits.map((h) => h.entityId)).toEqual(['title', 'body']);
  });

  it('replaces text on re-index and forgets it on unindex', async () => {
    await index({ entityType: 'side_note', entityId: 'n1', articleId: 'a1', title: '', body: '旧文字' });
    await index({ entityType: 'side_note', entityId: 'n1', articleId: 'a1', title: '', body: '新文字' });
    expect(await ids({ text: '旧' })).toEqual([]);
    expect(await ids({ text: '新' })).toEqual(['side_note:n1']);
    await lib.driver.batch(unindexStatements('side_note', 'n1'));
    expect(await ids({ text: '文字' })).toEqual([]);
  });

  it('filters by a tag including all its descendants, with or without keywords', async () => {
    await seed();
    await edge('技巧', '修辞');
    await edge('修辞', '比喻');
    await tag('比喻', 'side_note', 'n1', 'a1');
    expect(await ids({ text: '比喻', tagIds: ['技巧'] })).toEqual(['side_note:n1']);
    expect(await ids({ tagIds: ['技巧'] })).toEqual(['side_note:n1']);
  });

  it('inherits article tags only when asked', async () => {
    await seed();
    await tag('鲁迅', 'article', 'a1', 'a1');
    expect(await ids({ text: '比喻', tagIds: ['鲁迅'] })).toEqual(['article:a1']);
    expect(await ids({ text: '比喻', tagIds: ['鲁迅'], inherit: true })).toEqual(['article:a1', 'markup:m1', 'side_note:n1']);
  });

  it('requires every selected tag', async () => {
    await seed();
    await tag('X', 'side_note', 'n1', 'a1');
    await tag('Y', 'side_note', 'n1', 'a1');
    await tag('X', 'markup', 'm1', 'a1');
    expect(await ids({ tagIds: ['X', 'Y'] })).toEqual(['side_note:n1']);
  });

  it('ignores removed edges and taggings', async () => {
    await seed();
    await edge('P', 'C');
    await tag('C', 'markup', 'm1', 'a1');
    await edge('P', 'C', 1);
    expect(await ids({ tagIds: ['P'] })).toEqual([]);
    await tag('C', 'markup', 'm1', 'a1', 1);
    expect(await ids({ tagIds: ['C'] })).toEqual([]);
  });

  it('returns nothing for blank or punctuation-only text without tags (Review Focus 3)', async () => {
    await seed();
    expect(await search(lib.driver, { text: '   ' })).toEqual([]);
    expect(await search(lib.driver, { text: '。，！' })).toEqual([]);
    expect(await search(lib.driver, {})).toEqual([]);
  });

  it('never throws on arbitrary input (Review Focus 1)', async () => {
    await seed();
    const hostile = fc
      .array(fc.constantFrom('"', '*', '(', ')', ':', '-', '^', 'AND', 'OR', 'NOT', 'NEAR', ' ', '比', '喻', '😀', '\uD800'), { maxLength: 20 })
      .map((a) => a.join(''));
    await fc.assert(
      fc.asyncProperty(fc.oneof(fc.string(), hostile), async (text) => {
        expect(Array.isArray(await search(lib.driver, { text }))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
