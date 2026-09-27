import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { descendants, edgesToBreakCycles, foldTagName, planTagMerges, wouldCreateCycle, type TagEdge } from './graph';

const e = (parent: string, child: string, hlc = '1'): TagEdge => ({ id: `e:${parent}:${child}`, parent, child, hlc });

describe('descendants', () => {
  it('walks a DAG where a tag has several parents', () => {
    const edges = [e('技巧', '修辞'), e('修辞', '比喻'), e('意象', '比喻'), e('比喻', '明喻')];
    expect([...descendants(edges, '技巧')].sort()).toEqual(['修辞', '技巧', '明喻', '比喻'].sort());
    expect([...descendants(edges, '意象')].sort()).toEqual(['意象', '明喻', '比喻'].sort());
  });

  it('terminates on a cycle', () => {
    expect([...descendants([e('a', 'b'), e('b', 'a')], 'a')].sort()).toEqual(['a', 'b']);
  });
});

describe('wouldCreateCycle', () => {
  const edges = [e('a', 'b'), e('b', 'c')];
  it('detects self, direct and indirect cycles', () => {
    expect(wouldCreateCycle(edges, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(edges, 'b', 'a')).toBe(true);
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true);
  });
  it('allows a second parent', () => {
    expect(wouldCreateCycle(edges, 'x', 'c')).toBe(false);
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(false);
  });
});

describe('edgesToBreakCycles', () => {
  it('removes the newest edge of a two-cycle', () => {
    expect(edgesToBreakCycles([e('a', 'b', '1'), e('b', 'a', '2')])).toEqual(['e:b:a']);
  });

  it('removes one edge per independent cycle and nothing else', () => {
    const edges = [e('a', 'b', '5'), e('b', 'c', '1'), e('c', 'a', '2'), e('x', 'y', '1'), e('y', 'x', '9'), e('p', 'q', '9')];
    expect(edgesToBreakCycles(edges).sort()).toEqual(['e:a:b', 'e:y:x']);
  });

  it('returns nothing for an acyclic graph', () => {
    expect(edgesToBreakCycles([e('a', 'b'), e('a', 'c'), e('b', 'c')])).toEqual([]);
  });

  it('gives the same answer for any input order', () => {
    const edges = [e('a', 'b', '3'), e('b', 'c', '1'), e('c', 'a', '2'), e('c', 'd', '4'), e('d', 'b', '5')];
    const expected = edgesToBreakCycles(edges).sort();
    fc.assert(
      fc.property(fc.shuffledSubarray(edges, { minLength: edges.length, maxLength: edges.length }), (shuffled) => {
        expect(edgesToBreakCycles(shuffled).sort()).toEqual(expected);
      }),
    );
  });
});

describe('tag names', () => {
  it('folds width, case and surrounding space', () => {
    expect(foldTagName('  Metaphor ')).toBe('metaphor');
    expect(foldTagName('ＭＥＴＡ　phor')).toBe('meta phor');
  });

  it('plans merges into the smallest id', () => {
    const plan = planTagMerges([
      { id: 'b', name: '比喻' },
      { id: 'a', name: ' 比喻 ' },
      { id: 'c', name: 'Metaphor' },
      { id: 'd', name: 'metaphor' },
      { id: 'e', name: 'unique' },
    ]);
    expect(plan).toEqual([
      { keep: 'a', drop: ['b'] },
      { keep: 'c', drop: ['d'] },
    ]);
  });
});
