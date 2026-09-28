import { describe, expect, it } from 'vitest';
import { parseHash, routeHash, type Route } from './router';

describe('router', () => {
  it('parses the known routes and falls back to home', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
    expect(parseHash('#/diagnostics')).toEqual({ name: 'diagnostics' });
    expect(parseHash('#/trash')).toEqual({ name: 'trash' });
    expect(parseHash('#/library')).toEqual({ name: 'library' });
    expect(parseHash('#/memos')).toEqual({ name: 'memos' });
    expect(parseHash('#/tags')).toEqual({ name: 'tags' });
    expect(parseHash('#/article/0199-abc')).toEqual({ name: 'article', id: '0199-abc' });
    expect(parseHash('#/article/../../etc')).toEqual({ name: 'home' });
    expect(parseHash('#/nope')).toEqual({ name: 'home' });
  });

  it('round-trips every route', () => {
    const routes: Route[] = [{ name: 'home' }, { name: 'diagnostics' }, { name: 'trash' }, { name: 'library' }, { name: 'memos' }, { name: 'tags' }, { name: 'article', id: '0199a8e1-7c2b-7000-8000-000000000000' }];
    for (const r of routes) expect(parseHash(routeHash(r))).toEqual(r);
  });
});
