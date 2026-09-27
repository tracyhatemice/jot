import { useTranslation } from 'react-i18next';

export function MemoPane() {
  const { t } = useTranslation();
  return (
    <>
      <h2>{t('memo.heading')}</h2>
      <p className="muted">{t('memo.comingSoon')}</p>
    </>
  );
}
