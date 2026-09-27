import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'article'; id: string } | { name: 'diagnostics' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path === 'diagnostics') return { name: 'diagnostics' };
  const article = /^article\/([\w-]+)$/.exec(path);
  return article ? { name: 'article', id: article[1] } : { name: 'home' };
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'diagnostics':
      return '#/diagnostics';
    case 'article':
      return `#/article/${route.id}`;
  }
}

export function navigate(route: Route): void {
  window.location.hash = routeHash(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
