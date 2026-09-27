import { blockText } from '@jot/core';
import { getArticle } from '@jot/db';
import { useTranslation } from 'react-i18next';
import { useLibraryQuery } from '../data/LibraryContext';

export function ArticlePane({ articleId }: { articleId: string }) {
  const { t } = useTranslation();
  const article = useLibraryQuery((lib) => getArticle(lib, articleId), [articleId]);
  const a = article.data;
  if (article.loading && !a) return <p className="empty">{t('article.loading')}</p>;
  if (!a) return <p className="empty">{t('article.missing')}</p>;
  return (
    <div className="article-layout">
      <article>
        <h1 className="article-title" data-testid="article-title">
          {a.title}
        </h1>
        {a.author && <p className="byline">{a.author}</p>}
        <div className="article-view" data-testid="article-view">
          {a.blocks.map((b, i) => (
            <p key={i}>{blockText(b)}</p>
          ))}
        </div>
      </article>
    </div>
  );
}
