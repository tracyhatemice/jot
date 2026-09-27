import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shell } from './components/Shell';
import { LibraryProvider } from './data/LibraryContext';
import { openLibraryOnce, type Boot } from './data/openLibrary';
import { Diagnostics } from './diagnostics/Diagnostics';
import { useRoute } from './router';

export function App() {
  const { t } = useTranslation();
  const route = useRoute();
  const [boot, setBoot] = useState<Boot | null>(null);

  useEffect(() => {
    let active = true;
    void openLibraryOnce().then((b) => {
      if (active) setBoot(b);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!boot) return <p className="boot" data-testid="app-loading">{t('app.loading')}</p>;
  if (boot.kind === 'locked') return <p className="boot" data-testid="db-locked">{t('app.locked')}</p>;
  if (boot.kind === 'unavailable') {
    return <p className="boot" data-testid="db-unavailable">{t('app.unavailable', { message: boot.message })}</p>;
  }
  if (route.name === 'diagnostics') return <Diagnostics driver={boot.driver} platform={boot.platform} />;
  return (
    <LibraryProvider lib={boot.lib}>
      <Shell route={route} />
    </LibraryProvider>
  );
}
