import type { Op, SyncedTable } from '@jot/core';
import type { Library } from '@jot/db';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const LibraryContext = createContext<Library | null>(null);

export function LibraryProvider({ lib, children }: { lib: Library; children: ReactNode }) {
  return <LibraryContext.Provider value={lib}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): Library {
  const lib = useContext(LibraryContext);
  if (!lib) throw new Error('useLibrary must be used inside <LibraryProvider>');
  return lib;
}

/** Whether a commit's ops write any of `tables`; with no filter, every commit counts. */
export function touchesTables(ops: readonly Op[], tables?: readonly SyncedTable[]): boolean {
  return !tables || ops.some((op) => tables.includes(op.table));
}

export interface QueryState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
}

/**
 * Runs `load` now and again after every commit that writes one of `tables` (every commit when omitted),
 * so views follow the library without manual refresh.
 * A late result from an older run (or older `deps`) never overwrites a newer one.
 */
export function useLibraryQuery<T>(
  load: (lib: Library) => Promise<T>,
  deps: readonly unknown[],
  tables?: readonly SyncedTable[],
): QueryState<T> {
  const lib = useLibrary();
  const [state, setState] = useState<QueryState<T>>({ data: undefined, error: undefined, loading: true });
  const loadRef = useRef(load);
  loadRef.current = load;
  const tablesRef = useRef(tables);
  tablesRef.current = tables;

  useEffect(() => {
    let active = true;
    let version = 0;
    setState({ data: undefined, error: undefined, loading: true });
    const refresh = () => {
      const mine = ++version;
      loadRef.current(lib).then(
        (data) => {
          if (active && mine === version) setState({ data, error: undefined, loading: false });
        },
        (error: unknown) => {
          if (active && mine === version) {
            setState((s) => ({ ...s, error: error instanceof Error ? error : new Error(String(error)), loading: false }));
          }
        },
      );
    };
    refresh();
    const unsubscribe = lib.subscribe((ops) => {
      if (touchesTables(ops, tablesRef.current)) refresh();
    });
    return () => {
      active = false;
      unsubscribe();
    };
    // `deps` identify what `load` reads; `load` itself is recreated on every render (kept in loadRef).
  }, [lib, ...deps]);

  return state;
}
