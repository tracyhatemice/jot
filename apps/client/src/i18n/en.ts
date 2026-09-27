export const en = {
  app: {
    loading: 'Opening your library…',
    locked: 'Jot is already open in another tab. Close it to continue here.',
    unavailable: 'Storage is unavailable: {{message}}',
    language: 'Language',
    error: 'Something went wrong:',
    dismiss: 'Dismiss',
  },
  library: {
    heading: 'Library',
    empty: 'No articles yet. Import a model article to start.',
    import: 'Import',
    delete: 'Delete',
    confirmDelete: 'Delete “{{title}}”? Its markups and side notes are deleted too.',
    collapse: 'Hide library',
    expand: 'Show library',
  },
  importDialog: {
    heading: 'Import a model article',
    title: 'Title',
    titlePlaceholder: 'Leave empty to use the first line',
    author: 'Author',
    source: 'Source',
    paste: 'Paste the article',
    pastePlaceholder: 'Paste text here…',
    file: 'Or open a .txt or .md file',
    paragraphs: 'Paragraphs: {{count}}',
    submit: 'Import',
    cancel: 'Cancel',
    empty: 'There is no text to import.',
    unsupported: 'Only .txt and .md files can be imported for now.',
  },
  article: {
    none: 'Choose an article from the library, or import one.',
    loading: 'Loading…',
    missing: 'This article no longer exists.',
  },
  toolbar: {
    underline: 'Underline',
    bold: 'Bold',
    highlight: 'Highlight',
    note: 'Note',
  },
  markup: {
    remove: 'Remove markup',
    addNote: 'Add side note',
    styles: { underline: 'Underline', bold: 'Bold', highlight: 'Highlight' },
  },
  notes: {
    placeholder: 'Write a side note…',
    delete: 'Delete note',
  },
  memo: {
    heading: 'Memo',
    comingSoon: 'Analysis memos arrive in the next update.',
  },
};

export type Messages = typeof en;
