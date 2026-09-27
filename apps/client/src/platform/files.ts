import { invoke } from '@tauri-apps/api/core';
import { isTauri, type InvokeFn } from './tauri';

/**
 * Saves text as a file the user keeps. On the desktop the app writes it into the Downloads folder and
 * returns its path; in the browser it becomes a download (and the path isn't known: null).
 */
export async function saveTextFile(name: string, text: string, call: InvokeFn | null = isTauri() ? invoke : null): Promise<string | null> {
  if (call) return call<string>('save_text_file', { name, text });
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return null;
}
