import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { routeHash, type Route } from '../router';

interface Props {
  title: string;
  route: Route;
  folded: boolean;
  onFold(folded: boolean): void;
  action?: ReactNode;
  testId: string;
}

/** A sidebar section heading (spec §6.10): a fold arrow, the title opening the section's page, an optional action. */
export function SectionHeading({ title, route, folded, onFold, action, testId }: Props) {
  const { t } = useTranslation();
  return (
    <div className="section-heading" data-testid={testId}>
      <button
        type="button"
        className="icon section-fold"
        aria-label={t(folded ? 'sidebar.unfold' : 'sidebar.fold', { title })}
        aria-expanded={!folded}
        onClick={() => onFold(!folded)}
        data-testid={`${testId}-fold`}
      >
        {folded ? '▸' : '▾'}
      </button>
      <h2>
        <a href={routeHash(route)} data-testid={`${testId}-open`}>
          {title}
        </a>
      </h2>
      {action}
    </div>
  );
}
