import { execFile } from 'node:child_process';
import { authorizationUrl, EntryError } from './controller.js';

// Host-only, fixed executable and argv, no shell, no arbitrary URL-opening route.
export function openBrowser(url, signal, execute = execFile) {
  if (process.platform !== 'darwin' || !authorizationUrl(url)) return Promise.reject(new EntryError('OPEN_FAILED'));
  if (signal.aborted) return Promise.reject(new EntryError('OPEN_FAILED'));
  return new Promise((resolve, reject) => {
    execute('/usr/bin/open', [url], { shell: false, signal, timeout: 10_000, maxBuffer: 1024, encoding: 'utf8' }, error => {
      if (error) reject(new EntryError('OPEN_FAILED')); else resolve();
    });
  });
}
