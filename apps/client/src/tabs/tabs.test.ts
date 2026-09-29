import { describe, expect, it } from 'vitest';
import { closeTab, keepTab, openTab, parseTabs, retainTabs, tabAfterClose, type Tab } from './tabs';

const kept = (id: string): Tab => ({ id, preview: false });
const preview = (id: string): Tab => ({ id, preview: true });

describe('openTab', () => {
  it('switches to a tab the id already has, kept or preview, and changes nothing', () => {
    const tabs = [kept('a'), preview('b')];
    expect(openTab(tabs, 'a', 'b')).toBe(tabs);
    expect(openTab(tabs, 'b', 'a')).toBe(tabs);
  });

  it('shows a new id in the preview tab, in that tab’s place', () => {
    expect(openTab([kept('a'), preview('b'), kept('c')], 'd', 'c')).toEqual([kept('a'), preview('d'), kept('c')]);
  });

  it('with no preview tab, adds one right after the given tab, or at the end', () => {
    expect(openTab([kept('a'), kept('b')], 'c', 'a')).toEqual([kept('a'), preview('c'), kept('b')]);
    expect(openTab([kept('a'), kept('b')], 'c', null)).toEqual([kept('a'), kept('b'), preview('c')]);
    expect(openTab([kept('a')], 'c', 'gone')).toEqual([kept('a'), preview('c')]);
    expect(openTab([], 'a', null)).toEqual([preview('a')]);
  });
});

describe('keepTab', () => {
  it('turns the preview tab into a kept one', () => {
    expect(keepTab([kept('a'), preview('b')], 'b')).toEqual([kept('a'), kept('b')]);
  });

  it('leaves a kept tab alone, and adds a missing one at the end', () => {
    const tabs = [kept('a')];
    expect(keepTab(tabs, 'a')).toBe(tabs);
    expect(keepTab(tabs, 'b')).toEqual([kept('a'), kept('b')]);
  });
});

describe('closing a tab', () => {
  it('shows the right-hand neighbour, else the left-hand one, else nothing', () => {
    const tabs = [kept('a'), kept('b'), kept('c')];
    expect(tabAfterClose(tabs, 'b')).toBe('c');
    expect(tabAfterClose(tabs, 'c')).toBe('b');
    expect(tabAfterClose([kept('a')], 'a')).toBeNull();
    expect(tabAfterClose(tabs, 'x')).toBeNull();
    expect(closeTab(tabs, 'b')).toEqual([kept('a'), kept('c')]);
    expect(closeTab(tabs, 'x')).toBe(tabs);
  });
});

describe('retainTabs', () => {
  it('drops the tabs of ids that are gone, and returns the same list when none are', () => {
    const tabs = [kept('a'), preview('b')];
    expect(retainTabs(tabs, (id) => id !== 'b')).toEqual([kept('a')]);
    expect(retainTabs(tabs, () => true)).toBe(tabs);
  });
});

describe('parseTabs (Review Focus 4)', () => {
  it('reads back what was stored', () => {
    expect(parseTabs(JSON.stringify([kept('a'), preview('b')]))).toEqual([kept('a'), preview('b')]);
  });

  it('drops malformed storage and entries, repeated ids and a second preview tab', () => {
    expect(parseTabs(null)).toEqual([]);
    expect(parseTabs('{not json')).toEqual([]);
    expect(parseTabs('{"id":"a"}')).toEqual([]);
    expect(parseTabs(JSON.stringify([kept('a'), { id: 3 }, null, 'b', { id: '' }, kept('a'), preview('c'), preview('d')]))).toEqual([
      kept('a'),
      preview('c'),
      kept('d'),
    ]);
  });
});
