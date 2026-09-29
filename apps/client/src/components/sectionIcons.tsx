import type { ReactNode } from 'react';

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

/** A fold chevron: pointing right when folded, down when open (spec §6.12). */
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={open ? 'chevron open' : 'chevron'} viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

/** The sections' thin-line icons, shared by their headings and the collapsed rail (spec §6.12). */
export const SECTION_ICONS: Record<'library' | 'memos' | 'tags', ReactNode> = {
  library: icon('M6.5 3.5h7l4 4v13h-11zM13.5 3.5v4h4M9 12h6M9 15.5h6'),
  memos: icon('M5 4.5h11v15H5zM8 8.5h5M8 12h5M8 15.5h3M18.5 9.5l1.5 1.5-5.5 5.5h-1.5V15z'),
  tags: icon('M3.5 12.5v-8h8l9 9-8 8zM8.5 8.5h.01'),
};
