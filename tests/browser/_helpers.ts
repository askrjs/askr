import { afterEach, beforeEach, vi } from 'vite-plus/test';
import { cleanupApp } from '@askrjs/askr/boot';

let root: HTMLElement | null = null;
const originalFetch = window.fetch.bind(window);

beforeEach(() => {
  if (!root) {
    root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    return;
  }

  if (!document.body.contains(root)) {
    document.body.appendChild(root);
  }

  root.innerHTML = '';
});

afterEach(() => {
  if (root) {
    cleanupApp(root);
    root.innerHTML = '';
  }

  window.fetch = originalFetch;
  vi.unstubAllGlobals();
});

export type BrowserHarness =
  typeof import('../../test-utils/playwright-app/src/main.tsx');

export async function loadBrowserHarness(): Promise<BrowserHarness> {
  vi.stubGlobal('__ASKR_BROWSER_AUTOSTART__', false);
  return import('../../test-utils/playwright-app/src/main.tsx');
}

export function setBrowserLocation(url: string): void {
  window.history.replaceState({}, '', url);
}

export function mockJsonFetch(
  handler: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Response | Promise<Response>
): void {
  const abortError = () =>
    new DOMException('The operation was aborted.', 'AbortError');

  const fetchHandler = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);

    if (request.signal.aborted) {
      throw abortError();
    }

    const response = Promise.resolve(handler(request, init));

    return await new Promise<Response>((resolve, reject) => {
      const abort = () => reject(abortError());

      request.signal.addEventListener('abort', abort, { once: true });
      response.then(
        (value) => {
          request.signal.removeEventListener('abort', abort);
          resolve(value);
        },
        (error) => {
          request.signal.removeEventListener('abort', abort);
          reject(error);
        }
      );
    });
  };

  vi.stubGlobal('fetch', fetchHandler);
  window.fetch = fetchHandler as typeof window.fetch;
}
