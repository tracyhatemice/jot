import { describe, expect, it } from 'vitest';
import { detectLang } from './lang';

describe('detectLang', () => {
  it('recognizes Chinese text, even with some Latin words', () => {
    expect(detectLang('他用比喻写春天。')).toBe('zh');
    expect(detectLang('鲁迅在《故乡》里写道：AI 也读不懂这种 nostalgia。')).toBe('zh');
  });

  it('recognizes English text, even with a Chinese name', () => {
    expect(detectLang('Writers love a good metaphor, said 鲁迅.')).toBe('en');
  });

  it('defaults to English for text without letters', () => {
    expect(detectLang('')).toBe('en');
    expect(detectLang('123 !!!')).toBe('en');
  });
});
