import { InvalidExportError, NewerExportError, type ItemCounts } from '@jot/db';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary } from '../data/LibraryContext';
import { exportFileName, exportLibraryText, importLibraryText, restoreLibraryItems } from '../data/libraryFile';
import { showNotice } from '../data/notices';
import { LANGUAGES, setLanguage, type Language } from '../i18n';
import { backupDatabase, saveTextFile } from '../platform/files';
import { isTauri } from '../platform/tauri';

const LANGUAGE_NAMES: Record<Language, string> = { 'zh-CN': '简体中文', en: 'English' };

const total = (c: ItemCounts) => c.articles + c.markups + c.sideNotes + c.memos + c.tags;

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

  const backupNow = () => {
    setOpen(false);
    return run(async () => {
      showNotice(t('data.savedTo', { path: await backupDatabase(exportFileName('backup')) }));
    });
  };

  const onImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !window.confirm(t('data.confirmImport', { name: file.name }))) return;
    void run(async () => {
      const summary = await importLibraryText(lib, await file.text());
      const done = total(summary.changed) > 0 ? t('data.imported', { ...summary.changed }) : t('data.nothingNew');
      // A deletion made here after the file was made is the newer edit, so the merge keeps it: ask.
      if (total(summary.deletedHere) > 0 && window.confirm(t('data.confirmRestore', { ...summary.deletedHere }))) {
        await restoreLibraryItems(lib, summary.deletedHereRows);
        showNotice(`${done} ${t('data.restored', { ...summary.deletedHere })}`);
      } else {
        showNotice(done);
      }
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
        aria-busy={busy}
        onClick={() => setOpen(!open)}
        data-testid="settings-open"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M10.34 4.79 L10.52 2.11 L13.48 2.11 L13.66 4.79 A7.4 7.4 0 0 1 15.92 5.72 L17.95 3.96 L20.04 6.05 L18.28 8.08 A7.4 7.4 0 0 1 19.21 10.34 L21.89 10.52 L21.89 13.48 L19.21 13.66 A7.4 7.4 0 0 1 18.28 15.92 L20.04 17.95 L17.95 20.04 L15.92 18.28 A7.4 7.4 0 0 1 13.66 19.21 L13.48 21.89 L10.52 21.89 L10.34 19.21 A7.4 7.4 0 0 1 8.08 18.28 L6.05 20.04 L3.96 17.95 L5.72 15.92 A7.4 7.4 0 0 1 4.79 13.66 L2.11 13.48 L2.11 10.52 L4.79 10.34 A7.4 7.4 0 0 1 5.72 8.08 L3.96 6.05 L6.05 3.96 L8.08 5.72 A7.4 7.4 0 0 1 10.34 4.79Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      {busy && (
        <span className="muted settings-busy" role="status">
          {t('data.busy')}
        </span>
      )}
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
          {isTauri() && (
            <button type="button" disabled={busy} onClick={() => void backupNow()} data-testid="library-backup">
              {t('data.backup')}
            </button>
          )}
        </div>
      )}
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onImportFile} data-testid="library-import-file" />
    </div>
  );
}
