import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { onNotice } from '../data/notices';

/** Shows what a finished action did (an export saved, an import done) until dismissed. */
export function NoticeBanner() {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);

  useEffect(() => onNotice(setText), []);

  if (!text) return null;
  return (
    <div className="notice-banner" role="status" data-testid="notice">
      <span>{text}</span>
      <button type="button" onClick={() => setText(null)}>
        {t('app.dismiss')}
      </button>
    </div>
  );
}
