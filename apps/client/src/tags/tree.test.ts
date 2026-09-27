import type { TagEdgeRow, TagRow } from '@jot/db';
import { describe, expect, it } from 'vitest';
import { buildTagTree, type TagNode } from './tree';

const tag = (id: string, sort = id): TagRow => ({ id, name: id.toUpperCase(), color: null, sort_key: sort });
const edge = (parent: string, child: string): TagEdgeRow => ({ id: `e:${parent}:${child}`, parent_id: parent, child_id: child, hlc: '0' });
/** Each node as "depth:id", depth first. */
const flat = (nodes: TagNode[]): string[] => nodes.flatMap((n) => [`${n.depth}:${n.tag.id}`, ...flat(n.children)]);

describe('buildTagTree', () => {
  it('nests children under their parents, ordered by sort key', () => {
    expect(flat(buildTagTree([tag('b', 'a2'), tag('a', 'a1'), tag('c', 'a3')], [edge('a', 'c')]))).toEqual(['0:a', '1:c', '0:b']);
  });

  it('shows a tag with two parents under each, with distinct keys (Review Focus 4)', () => {
    const tree = buildTagTree([tag('a'), tag('b'), tag('c')], [edge('a', 'c'), edge('b', 'c')]);
    expect(flat(tree)).toEqual(['0:a', '1:c', '0:b', '1:c']);
    const [underA, underB] = [tree[0].children[0], tree[1].children[0]];
    expect(underA.key).not.toBe(underB.key);
    expect([underA.parentId, underB.parentId]).toEqual(['a', 'b']);
  });

  it('still shows tags caught in a cycle from another device, without looping', () => {
    expect(flat(buildTagTree([tag('a'), tag('b'), tag('r')], [edge('a', 'b'), edge('b', 'a')]))).toEqual(['0:r', '0:a', '1:b']);
  });

  it('ignores edges to tags that no longer exist', () => {
    expect(flat(buildTagTree([tag('c')], [edge('gone', 'c')]))).toEqual(['0:c']);
  });
});
