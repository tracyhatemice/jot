import { describe, expect, it } from 'vitest';
import { en } from './en';
import { pickLanguage } from './index';
import { zhCN } from './zh-CN';

describe('pickLanguage', () => {
  it('uses a stored choice first', () => {
    expect(pickLanguage('en', ['zh-CN'])).toBe('en');
    expect(pickLanguage('zh-CN', ['en-US'])).toBe('zh-CN');
  });

  it('otherwise follows the first Chinese or English browser language', () => {
    expect(pickLanguage(null, ['zh-TW'])).toBe('zh-CN');
    expect(pickLanguage(null, ['fr-FR', 'zh-CN', 'en'])).toBe('zh-CN');
    expect(pickLanguage(null, ['en-GB'])).toBe('en');
    expect(pickLanguage('garbage', ['de'])).toBe('en');
  });
});

describe('translations', () => {
  const leaves = (o: object, prefix = ''): [string, string][] =>
    Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[`${prefix}${k}`, v]] : leaves(v as object, `${prefix}${k}.`)));
  const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

  it('define the same keys in both languages', () => {
    expect(leaves(zhCN).map(([k]) => k).sort()).toEqual(leaves(en).map(([k]) => k).sort());
  });

  it('keep the same {{placeholders}} and no empty strings', () => {
    const zh = new Map(leaves(zhCN));
    for (const [key, value] of leaves(en)) {
      expect(value.length, key).toBeGreaterThan(0);
      expect(zh.get(key)?.length ?? 0, key).toBeGreaterThan(0);
      expect(placeholders(zh.get(key) ?? ''), key).toEqual(placeholders(value));
    }
  });
});
