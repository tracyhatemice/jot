import { tagEdgeId } from '@jot/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { Library } from './library';
import {
  addParent, createTag, deleteTag, descendantTagIds, DuplicateTagNameError, InvalidTagNameError, listEdges,
  listTags, removeParent, renameTag, repairTagGraph, TagCycleError, tagEntity, tagsOf, untagEntity,
} from './tags';

let lib: Library;
beforeEach(async () => {
  lib = await Library.open(createNodeDriver());
});

const createTags = async (...names: string[]) => {
  const ids: string[] = [];
  for (const name of names) ids.push(await createTag(lib, { name }));
  return ids;
};

describe('tags', () => {
  it('creates and lists tags in creation order', async () => {
    const a = await createTag(lib, { name: '技巧' });
    const b = await createTag(lib, { name: 'Metaphor', color: '#c33' });
    expect((await listTags(lib)).map((t) => [t.id, t.name, t.color])).toEqual([
      [a, '技巧', null],
      [b, 'Metaphor', '#c33'],
    ]);
  });

  it('rejects blank names (Review Focus 3)', async () => {
    await expect(createTag(lib, { name: '  　 ' })).rejects.toBeInstanceOf(InvalidTagNameError);
  });

  it('rejects names that differ only by case, width or spacing', async () => {
    await createTag(lib, { name: 'Metaphor' });
    await expect(createTag(lib, { name: ' ｍｅｔａｐｈｏｒ ' })).rejects.toBeInstanceOf(DuplicateTagNameError);
  });

  it('renames, refusing a duplicate name', async () => {
    const [a] = await createTags('比喻', '修辞');
    await renameTag(lib, a, '暗喻');
    expect((await listTags(lib)).map((t) => t.name)).toEqual(['暗喻', '修辞']);
    await expect(renameTag(lib, a, '修辞')).rejects.toBeInstanceOf(DuplicateTagNameError);
  });

  it('builds a multi-parent hierarchy', async () => {
    const [tech, rhetoric, imagery, metaphor] = await createTags('技巧', '修辞', '意象', '比喻');
    await addParent(lib, rhetoric, tech);
    await addParent(lib, metaphor, rhetoric);
    await addParent(lib, metaphor, imagery);
    expect((await descendantTagIds(lib, tech)).sort()).toEqual([tech, rhetoric, metaphor].sort());
    expect((await descendantTagIds(lib, imagery)).sort()).toEqual([imagery, metaphor].sort());
  });

  it('refuses edges that would create a cycle', async () => {
    const [a, b, c] = await createTags('A', 'B', 'C');
    await addParent(lib, b, a);
    await addParent(lib, c, b);
    await expect(addParent(lib, a, c)).rejects.toBeInstanceOf(TagCycleError);
    await expect(addParent(lib, a, a)).rejects.toBeInstanceOf(TagCycleError);
  });

  it('lets only one of two concurrent opposite edges through', async () => {
    const [a, b] = await createTags('A', 'B');
    const results = await Promise.allSettled([addParent(lib, a, b), addParent(lib, b, a)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await listEdges(lib)).toHaveLength(1);
  });

  it('removes and re-adds a parent', async () => {
    const [p, c] = await createTags('P', 'C');
    await addParent(lib, c, p);
    await removeParent(lib, c, p);
    expect(await listEdges(lib)).toEqual([]);
    await addParent(lib, c, p);
    expect(await listEdges(lib)).toMatchObject([{ parent_id: p, child_id: c }]);
  });

  it('tags and untags entities', async () => {
    const [t] = await createTags('T');
    const target = { tagId: t, entityType: 'markup' as const, entityId: 'm1', articleId: 'a1' };
    await tagEntity(lib, target);
    expect(await tagsOf(lib, 'markup', 'm1')).toEqual([t]);
    await untagEntity(lib, target);
    expect(await tagsOf(lib, 'markup', 'm1')).toEqual([]);
  });

  it('deleting a tag also removes its edges and taggings', async () => {
    const [p, c] = await createTags('P', 'C');
    await addParent(lib, c, p);
    await tagEntity(lib, { tagId: p, entityType: 'memo', entityId: 'memo1', articleId: null });
    await deleteTag(lib, p);
    expect((await listTags(lib)).map((t) => t.id)).toEqual([c]);
    expect(await listEdges(lib)).toEqual([]);
    expect(await tagsOf(lib, 'memo', 'memo1')).toEqual([]);
  });

  it('repairs cycles and duplicate names that arrive from other devices', async () => {
    const [a, b] = await createTags('A', 'B');
    await addParent(lib, b, a); // A → B
    // Simulate ops from another device that bypassed the local checks.
    await lib.commit([{ table: 'tag_edge', id: tagEdgeId(b, a), fields: { parent_id: b, child_id: a, deleted: 0 } }]);
    await lib.commit([{ table: 'tag', id: 'zzz-dup', fields: { name: 'a', color: null, sort_key: 'zz', created_at: 1 } }]);
    await tagEntity(lib, { tagId: 'zzz-dup', entityType: 'memo', entityId: 'memo1', articleId: null });

    const report = await repairTagGraph(lib);

    expect(report.mergedTags).toEqual([{ keep: a, drop: ['zzz-dup'] }]);
    expect(report.removedEdges).toEqual([tagEdgeId(b, a)]);
    expect(await tagsOf(lib, 'memo', 'memo1')).toEqual([a]);
    expect((await listTags(lib)).map((t) => t.id)).toEqual([a, b]);
    expect(await listEdges(lib)).toMatchObject([{ parent_id: a, child_id: b }]);
    // The merged-away tag lives on in the kept one: erased, so it never shows in the Trash.
    expect(await lib.driver.query('SELECT deleted FROM tag WHERE id = ?', ['zzz-dup'])).toEqual([{ deleted: 2 }]);
  });
});
