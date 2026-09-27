import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { Library } from './library';
import { addParent, createTag, listEdges, moveTag, TagCycleError } from './tags';

const pairs = async (lib: Library) => (await listEdges(lib)).map((e) => `${e.parent_id}>${e.child_id}`).sort();

describe('moveTag', () => {
  it('moves a tag from one parent to another, or from the top level, in one step', async () => {
    const lib = await Library.open(createNodeDriver());
    const a = await createTag(lib, { name: 'a' });
    const b = await createTag(lib, { name: 'b' });
    const c = await createTag(lib, { name: 'c' });
    await addParent(lib, c, a);
    await moveTag(lib, c, a, b);
    expect(await pairs(lib)).toEqual([`${b}>${c}`]);
    await moveTag(lib, a, null, b);
    expect(await pairs(lib)).toEqual([`${b}>${a}`, `${b}>${c}`].sort());
  });

  it('refuses to move a tag under itself or its own subtag, changing nothing (Review Focus 4)', async () => {
    const lib = await Library.open(createNodeDriver());
    const a = await createTag(lib, { name: 'a' });
    const b = await createTag(lib, { name: 'b' });
    await addParent(lib, b, a);
    await expect(moveTag(lib, a, null, b)).rejects.toBeInstanceOf(TagCycleError);
    await expect(moveTag(lib, a, null, a)).rejects.toBeInstanceOf(TagCycleError);
    expect(await pairs(lib)).toEqual([`${a}>${b}`]);
  });
});
