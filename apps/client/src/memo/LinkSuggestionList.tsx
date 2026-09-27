import { forwardRef, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LinkSuggestionState } from './linkSuggestion';

export interface LinkSuggestionListHandle {
  onKeyDown(event: KeyboardEvent): boolean;
}

/** The passages offered after `[[`, under the typed trigger. Arrow keys move, Enter or a click chooses. */
export const LinkSuggestionList = forwardRef<LinkSuggestionListHandle, { state: LinkSuggestionState }>(function LinkSuggestionList(
  { state },
  ref,
) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [indexFor, setIndexFor] = useState(state.query);
  if (indexFor !== state.query) {
    // New text after the trigger: start again at the best match.
    setIndexFor(state.query);
    setIndex(0);
  }
  const count = state.items.length;
  const current = Math.min(index, Math.max(count - 1, 0));

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown(event) {
        if (count === 0) return false;
        if (event.key === 'ArrowDown') setIndex((current + 1) % count);
        else if (event.key === 'ArrowUp') setIndex((current - 1 + count) % count);
        else if (event.key === 'Enter') state.choose(state.items[current]);
        else return false;
        return true;
      },
    }),
    [count, current, state],
  );

  const blank = state.query.trim() === '';
  return (
    <ul
      className="link-suggestions"
      role="listbox"
      style={state.rect ? { left: state.rect.left, top: state.rect.bottom + 4 } : undefined}
      onMouseDown={(e) => e.preventDefault()}
      data-testid="link-suggestions"
    >
      {blank && <li className="muted">{t('memo.suggestHint')}</li>}
      {!blank && count === 0 && (
        <li className="muted" data-testid="link-suggestion-empty">
          {t('memo.suggestNone')}
        </li>
      )}
      {state.items.map((item, i) => (
        <li
          key={`${item.targetType}:${item.targetId}`}
          role="option"
          aria-selected={i === current}
          className={i === current ? 'active' : undefined}
          onClick={() => state.choose(item)}
          data-testid="link-suggestion"
        >
          <span className="label">{item.label}</span>
          <span className="source">{item.source}</span>
        </li>
      ))}
    </ul>
  );
});
