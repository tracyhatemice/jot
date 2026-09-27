import { useState } from 'react';

/** A number kept in localStorage (a per-device layout preference); falls back silently when storage is blocked. */
export function useStoredNumber(key: string, initial: number): [number, (value: number) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(key));
      return Number.isFinite(stored) && stored > 0 ? stored : initial;
    } catch {
      return initial;
    }
  });
  const update = (next: number) => {
    setValue(next);
    try {
      localStorage.setItem(key, String(next));
    } catch {
      // storage blocked: keep the value for this session only
    }
  };
  return [value, update];
}

/** A boolean layout preference kept in localStorage (stored as 1 = true, 2 = false; useStoredNumber treats 0 as unset). */
export function useStoredFlag(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useStoredNumber(key, initial ? 1 : 2);
  return [value === 1, (next) => setValue(next ? 1 : 2)];
}
