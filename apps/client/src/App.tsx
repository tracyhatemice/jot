import { Diagnostics } from './diagnostics/Diagnostics';

/** Plan 1 ships only the storage diagnostics screen; plan 2 replaces this with the app shell. */
export function App() {
  return <Diagnostics />;
}
