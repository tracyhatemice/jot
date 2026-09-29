import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { parseTabs, type Tab } from './tabs';

/** Open tabs kept in localStorage, this device's view (spec §6.13); they last for the session when storage is blocked. */
export function useStoredTabs(key: string): [Tab[], Dispatch<SetStateAction<Tab[]>>] {
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try {
      return parseTabs(localStorage.getItem(key));
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(tabs));
    } catch {
      // storage blocked: keep the tabs for this session only
    }
  }, [key, tabs]);
  return [tabs, setTabs];
}
