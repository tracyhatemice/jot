import type { Route } from '../router';

export function Shell({ route }: { route: Route }) {
  return <main data-testid="shell">{route.name}</main>;
}
