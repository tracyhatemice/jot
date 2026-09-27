import { DuplicateTagNameError, InvalidTagNameError, TagCycleError } from '@jot/db';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';

export type TagErrorKey = 'tags.cycle' | 'tags.duplicate' | 'tags.blank';

/** The message (and its values) that explains a tag error, or null for other errors. */
export function tagErrorKey(error: unknown): { key: TagErrorKey; name?: string } | null {
  if (error instanceof TagCycleError) return { key: 'tags.cycle' };
  if (error instanceof DuplicateTagNameError) return { key: 'tags.duplicate', name: error.tagName };
  if (error instanceof InvalidTagNameError) return { key: 'tags.blank' };
  return null;
}

/** Reports a failed tag action, explaining tag errors in the interface language. */
export function useReportTagError(): (error: unknown) => void {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown) => {
      const known = tagErrorKey(error);
      reportError(known ? new Error(t(known.key, { name: known.name ?? '' })) : error);
    },
    [t],
  );
}
