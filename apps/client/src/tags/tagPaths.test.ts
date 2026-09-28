import { describe, expect, it } from 'vitest';
import { tagPaths } from './tagPaths';

describe('tagPaths', () => {
  it('lists every path from a top-level tag, for tags with several parents too', () => {
    const tags = [
      { id: 'a', name: '技巧' },
      { id: 'b', name: '修辞' },
      { id: 'c', name: '比喻' },
      { id: 'd', name: '手法' },
    ];
    const edges = [
      { parent_id: 'a', child_id: 'b' },
      { parent_id: 'b', child_id: 'c' },
      { parent_id: 'd', child_id: 'c' },
    ];
    const paths = tagPaths(tags, edges);
    expect(paths.get('a')).toEqual(['技巧']);
    expect(paths.get('b')).toEqual(['技巧 › 修辞']);
    expect(paths.get('c')).toEqual(['手法 › 比喻', '技巧 › 修辞 › 比喻']);
  });
});
