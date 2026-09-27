import type { TagRow } from '@jot/db';
import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { isImeKey } from '../data/ime';
import { matchTags } from '../tags/match';
import { useTagIndex } from '../tags/TagContext';

interface Props {
  /** Tags not to offer: already applied, or not allowed here. */
  exclude?: ReadonlySet<string>;
  /** Offer to create a tag named after the text when no tag has that name. */
  allowCreate?: boolean;
  onPick(tag: TagRow): void;
  onCreate?(name: string): void;
  onClose(): void;
}

type Option = { kind: 'tag'; tag: TagRow } | { kind: 'create'; name: string };

/**
 * A search-as-you-type tag chooser. Enter takes the highlighted option: by default the tag whose name
 * matches the text ignoring case and width, so "ＣＲＡＦＴ" picks "Craft" rather than making a duplicate.
 * Escape, or leaving the field, closes it.
 */
export function TagPicker({ exclude, allowCreate = false, onPick, onCreate, onClose }: Props) {
  const { t } = useTranslation();
  const { tags } = useTagIndex();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<number | null>(null);
  const { matches, exact, canCreate } = matchTags(tags, query, exclude);
  const name = query.trim();
  const options: Option[] = matches.map((tag) => ({ kind: 'tag', tag }));
  if (allowCreate && canCreate && name) options.push({ kind: 'create', name });
  // With an exact match the default is that tag; if it is excluded (already applied) there is nothing to do.
  const fallback = exact ? options.findIndex((o) => o.kind === 'tag' && o.tag.id === exact.id) : 0;
  const active = chosen ?? fallback;
  const label = allowCreate ? t('tags.pick') : t('tags.pickExisting');

  const choose = (option: Option) => {
    if (option.kind === 'tag') onPick(option.tag);
    else onCreate?.(option.name);
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isImeKey(e.nativeEvent)) return; // Enter confirms the input method's text, not a tag
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = options.length;
      if (n === 0) return;
      const down = e.key === 'ArrowDown';
      const from = active < 0 ? (down ? -1 : 0) : active;
      setChosen((from + (down ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = options[active];
      if (option) choose(option);
      else onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // close the picker only, not the menu around it
      onClose();
    }
  };

  return (
    <div className="tag-picker">
      <input
        autoFocus
        value={query}
        placeholder={label}
        aria-label={label}
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setChosen(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={onClose}
        data-testid="tag-input"
      />
      <ul id={listId} role="listbox" className="tag-options">
        {options.map((option, i) => (
          <li
            key={option.kind === 'tag' ? option.tag.id : 'create'}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={i === active ? 'active' : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(option)}
            data-testid={option.kind === 'tag' ? 'tag-option' : 'tag-create'}
          >
            {option.kind === 'tag' ? option.tag.name : t('tags.create', { name: option.name })}
          </li>
        ))}
        {options.length === 0 && (
          <li className="muted" data-testid="tag-no-matches">
            {t('tags.noMatches')}
          </li>
        )}
      </ul>
    </div>
  );
}
