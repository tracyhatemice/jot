import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { onError } from '../data/errors';

/** Shows the latest failed action until dismissed, so writes never fail silently. */
export function ErrorBanner() {
  const { t } = useTranslation();
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => onError(setError), []);

  if (!error) return null;
  return (
    <div className="error-banner" role="alert" data-testid="error-banner">
      <strong>{t('app.error')}</strong> <span>{error.message}</span>
      <button type="button" onClick={() => setError(null)}>
        {t('app.dismiss')}
      </button>
    </div>
  );
}
