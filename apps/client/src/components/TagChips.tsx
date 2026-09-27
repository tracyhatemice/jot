import { createTag, tagEntity, untagEntity, type TaggingTarget } from '@jot/db';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibrary } from '../data/LibraryContext';
import { useReportTagError } from '../tags/errors';
import { useTagIndex } from '../tags/TagContext';
import { TagPicker } from './TagPicker';

/** The item being tagged. */
export type TagTarget = Omit<TaggingTarget, 'tagId'>;

interface Props {
  target: TagTarget;
  tagIds: readonly string[];
  testId: string;
  className?: string;
}

/** An item's tags as chips: × removes one, # adds an existing or new tag. */
export function TagChips({ target, tagIds, testId, className }: Props) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const report = useReportTagError();
  const { tags } = useTagIndex();
  const [adding, setAdding] = useState(false);
  const applied = new Set(tagIds);
  const shown = tags.filter((tag) => applied.has(tag.id));

  const add = (tagId: string) => tagEntity(lib, { ...target, tagId });
  const create = async (name: string) => add(await createTag(lib, { name }));

  return (
    <div className={className ? `tag-chips ${className}` : 'tag-chips'} data-testid={testId}>
      {shown.map((tag) => (
        <span key={tag.id} className="tag-chip">
          <span data-testid="tag-chip">{tag.name}</span>
          <button
            type="button"
            className="tag-chip-remove"
            aria-label={t('tags.remove', { name: tag.name })}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => untagEntity(lib, { ...target, tagId: tag.id }).catch(report)}
            data-testid="tag-chip-remove"
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <TagPicker
          allowCreate
          exclude={applied}
          onPick={(tag) => add(tag.id).catch(report)}
          onCreate={(name) => create(name).catch(report)}
          onClose={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          className="tag-add"
          aria-label={t('tags.add')}
          title={t('tags.add')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setAdding(true)}
          data-testid="tag-add"
        >
          #
        </button>
      )}
    </div>
  );
}
