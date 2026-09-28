import { useState } from 'react';
import { DEFAULT_STYLE, parseStyle, type ReadingKind, type ReadingStyle } from './readingStyle';

/** A column's reading style, kept in localStorage on this device (spec §6.10); storage may be blocked. */
export function useReadingStyle(kind: ReadingKind): [ReadingStyle, (next: ReadingStyle) => void] {
  const key = `jot.reading.${kind}`;
  const [style, setStyle] = useState<ReadingStyle>(() => {
    try {
      const raw = localStorage.getItem(key);
      return parseStyle(raw ? (JSON.parse(raw) as unknown) : null, kind);
    } catch {
      return DEFAULT_STYLE[kind];
    }
  });
  const update = (next: ReadingStyle) => {
    setStyle(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // storage blocked: keep the style for this session only
    }
  };
  return [style, update];
}
