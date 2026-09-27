import { InvalidExportError, NewerExportError } from '@jot/db';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary } from '../data/LibraryContext';
import { exportFileName, exportLibraryText, importLibraryText } from '../data/libraryFile';
import { showNotice } from '../data/notices';
import { LANGUAGES, setLanguage, type Language } from '../i18n';
import { saveTextFile } from '../platform/files';

const LANGUAGE_NAMES: Record<Language, string> = { 'zh-CN': '简体中文', en: 'English' };

/** The gear at the bottom of the sidebar: interface language, and exporting and importing the library (spec §6.7). */
export function SettingsMenu() {
  const { t, i18n } = useTranslation();
  const lib = useLibrary();
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Escape or a click elsewhere closes the menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      if (error instanceof NewerExportError) reportError(new Error(t('data.newer')));
      else if (error instanceof InvalidExportError) reportError(new Error(t('data.invalid')));
      else reportError(error);
    } finally {
      setBusy(false);
    }
  };

  const exportNow = () => {
    setOpen(false);
    return run(async () => {
      const name = exportFileName('library');
      const where = await saveTextFile(name, await exportLibraryText(lib));
      showNotice(where ? t('data.savedTo', { path: where }) : t('data.exported', { name }));
    });
  };

  const chooseImport = () => {
    setOpen(false);
    fileRef.current?.click();
  };

  const onImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !window.confirm(t('data.confirmImport', { name: file.name }))) return;
    void run(async () => {
      const summary = await importLibraryText(lib, await file.text());
      showNotice(t('data.imported', { ...summary }));
    });
  };

  return (
    <div className="settings" ref={rootRef}>
      <button
        type="button"
        className="icon settings-toggle"
        aria-label={t('settings.open')}
        title={t('settings.open')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="settings-open"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
        </svg>
      </button>
      {busy && <span className="muted">{t('data.busy')}</span>}
      {open && (
        <div className="settings-menu" role="dialog" aria-label={t('settings.open')} data-testid="settings-menu">
          <label className="settings-row">
            <span>{t('app.language')}</span>
            <select value={i18n.language} onChange={(e) => setLanguage(e.target.value as Language).catch(reportError)} data-testid="language">
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_NAMES[l]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy} onClick={() => void exportNow()} data-testid="library-export">
            {t('data.export')}
          </button>
          <button type="button" disabled={busy} onClick={chooseImport} data-testid="library-import">
            {t('data.import')}
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onImportFile} data-testid="library-import-file" />
    </div>
  );
}
