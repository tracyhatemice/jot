import { captureAnchor } from '@jot/core';
import { createMarkup, createSideNote, getArticle, listMarkups } from '@jot/db';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { markupRange, type ToolbarAction } from '../article/markupRange';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { ArticleView, type SelectionInfo } from './ArticleView';
import { SelectionToolbar } from './SelectionToolbar';

export function ArticlePane({ articleId }: { articleId: string }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const article = useLibraryQuery((l) => getArticle(l, articleId), [articleId]);
  const markups = useLibraryQuery((l) => listMarkups(l, articleId), [articleId]);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [activeMarkupId, setActiveMarkupId] = useState<string | null>(null);

  const a = article.data;
  if (article.loading && !a) return <p className="empty">{t('article.loading')}</p>;
  if (!a) return <p className="empty">{t('article.missing')}</p>;

  const onAction = async (action: ToolbarAction) => {
    const sel = selection;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    if (!sel) return;
    const range = markupRange(action, a, sel);
    if (!range) return;
    const anchor = captureAnchor(a.text, range.start, range.end, action === 'paragraph' ? 'block' : 'range');
    const kind = action === 'note' ? 'term' : action;
    const { markupId } = await createMarkup(lib, { articleId, revisionId: a.revisionId, anchor, kind });
    setActiveMarkupId(markupId);
    if (action === 'note') await createSideNote(lib, { markupId, articleId, body: '' });
  };

  const box = layoutRef.current?.getBoundingClientRect();
  const toolbarAt = selection && box ? { top: selection.rect.top - box.top - 6, left: Math.max(0, selection.rect.left - box.left) } : null;

  return (
    <div className="article-layout" ref={layoutRef}>
      <article lang={a.lang === 'zh' ? 'zh-CN' : 'en'}>
        <h1 className="article-title" data-testid="article-title">
          {a.title}
        </h1>
        {a.author && <p className="byline">{a.author}</p>}
        <ArticleView
          revisionId={a.revisionId}
          blocks={a.blocks}
          markups={markups.data ?? []}
          activeMarkupId={activeMarkupId}
          onSelection={setSelection}
          onMarkupClick={(ids) => setActiveMarkupId(ids[0] ?? null)}
        />
      </article>
      <div className="margin" data-testid="margin" />
      {toolbarAt && <SelectionToolbar top={toolbarAt.top} left={toolbarAt.left} onAction={(k) => void onAction(k)} />}
    </div>
  );
}
