import { createContext, useContext } from 'react';

/** What the shell's column layout tells the article pane (spec §6.13). */
export interface Columns {
  /** Side notes in their column, or as icons after their passages. */
  notes: 'column' | 'icons';
  /** The side-note column's width. */
  notesWidth: number;
  /** Whether the memo column floats off the right edge. */
  memoFloating: boolean;
  /** Slides the floating memo column in. */
  revealMemo(): void;
}

const ColumnsContext = createContext<Columns>({ notes: 'column', notesWidth: 240, memoFloating: false, revealMemo: () => undefined });

export const ColumnsProvider = ColumnsContext.Provider;

export function useColumns(): Columns {
  return useContext(ColumnsContext);
}
