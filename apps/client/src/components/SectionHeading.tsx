import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { routeHash, type Route } from '../router';
import { Chevron } from './sectionIcons';

interface Props {
  title: string;
  /** The section's icon, shown before its title (spec §6.12). */
  icon?: ReactNode;
  route: Route;
  folded: boolean;
  onFold(folded: boolean): void;
  action?: ReactNode;
  testId: string;
}

/** A sidebar section heading (spec §6.10, §6.12): a fold arrow, the icon and title opening the section's page, an optional action. */
export function SectionHeading({ title, icon, route, folded, onFold, action, testId }: Props) {
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
        <Chevron open={!folded} />
      </button>
      <h2>
        <a href={routeHash(route)} data-testid={`${testId}-open`}>
          {icon}
          {title}
        </a>
      </h2>
      {action}
    </div>
  );
}
