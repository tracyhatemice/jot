import type { LinkTargetType } from '@jot/db';
import { createContext, useContext } from 'react';
import type { LinkTarget, MemoBridge } from './bridge';

/** A request to show a link target in the article column; `token` makes repeated clicks count. */
export interface FocusTarget {
  articleId: string;
  targetType: LinkTargetType;
  targetId: string;
  token: number;
}

export interface MemoContextValue {
  bridge: MemoBridge;
  focus: FocusTarget | null;
  follow(link: LinkTarget): void;
  /** Marks the follow request `token` as handled, so showing its article again does not replay it. */
  settle(token: number): void;
}

const MemoContext = createContext<MemoContextValue | null>(null);

export const MemoProvider = MemoContext.Provider;

export function useMemoContext(): MemoContextValue {
  const value = useContext(MemoContext);
  if (!value) throw new Error('useMemoContext must be used inside <MemoProvider>');
  return value;
}
