import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { navigate } from '../router';
import type { Tab } from '../tabs/tabs';
import { OverlayScrollbar } from './OverlayScrollbar';
import { useTabStrip } from './useTabStrip';

interface Props {
  tabs: Tab[];
  titles: ReadonlyMap<string, string>;
  activeId: string | null;
  onKeep(id: string): void;
  onClose(id: string): void;
}

/**
 * The article column's tab strip (spec §6.13): a tab per open article, at most one of them the preview tab, which the
 * next opened article replaces. Double-clicking the preview tab keeps it.
 */
export function ArticleTabs({ tabs, titles, activeId, onKeep, onClose }: Props) {
  const { t } = useTranslation();
  const stripRef = useRef<HTMLDivElement>(null);
  useTabStrip(stripRef, '.article-tab.active', activeId, tabs.length);
  if (tabs.length === 0) return null;
  return (
    <div className="article-tabs-bar">
      <div className="article-tabs" role="tablist" aria-label={t('tabs.label')} ref={stripRef} data-testid="article-tabs">
        {tabs.map((tab) => {
          const title = titles.get(tab.id) ?? '';
          const active = tab.id === activeId;
          return (
            <span key={tab.id} className={['article-tab', active && 'active', tab.preview && 'preview'].filter(Boolean).join(' ')} data-testid="article-tab">
              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={title}
                onClick={(e) => {
                  navigate({ name: 'article', id: tab.id });
                  // Enter on the active preview tab keeps it, as a double click does (final review I4).
                  if (e.detail === 0 && tab.preview && active) onKeep(tab.id);
                }}
                onDoubleClick={() => onKeep(tab.id)}
                aria-describedby={tab.preview ? 'article-preview-hint' : undefined}
              >
                {title}
              </button>
              <button type="button" className="icon" aria-label={t('tabs.close', { title })} title={t('tabs.close', { title })} onClick={() => onClose(tab.id)} data-testid="article-tab-close">
                ×
              </button>
            </span>
          );
        })}
      </div>
      <OverlayScrollbar axis="x" testId="article-tabs-thumb" />
      <span id="article-preview-hint" hidden>
        {t('tabs.preview')}
      </span>
    </div>
  );
}
