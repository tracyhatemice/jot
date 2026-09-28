import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'article'; id: string } | { name: 'diagnostics' } | { name: 'trash' } | { name: 'library' } | { name: 'memos' } | { name: 'tags' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path === 'diagnostics') return { name: 'diagnostics' };
  if (path === 'trash') return { name: 'trash' };
  if (path === 'library' || path === 'memos' || path === 'tags') return { name: path };
  const article = /^article\/([\w-]+)$/.exec(path);
  return article ? { name: 'article', id: article[1] } : { name: 'home' };
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'diagnostics':
      return '#/diagnostics';
    case 'trash':
      return '#/trash';
    case 'library':
      return '#/library';
    case 'memos':
      return '#/memos';
    case 'tags':
      return '#/tags';
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
