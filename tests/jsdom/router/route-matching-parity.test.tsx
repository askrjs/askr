/**
 * Client, SSR and SSG route matching must pick the same route for a URL:
 * precedence is decided segment by segment (static > param > wildcard >
 * splat at the first differing segment) and static segments compare against
 * decoded URL segments, so `/café` and `/a b` routes match their encoded URLs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { createSPA } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import {
  createRouteRegistry,
  currentRoute,
  fallback,
  index,
  page,
  route,
} from '../../../src/router/route';
import { Outlet } from '../../../src/router/rendering';
import { renderToString } from '../../../src/ssr';
import { resetRouteState } from '../../router-test-utils';

function setGlobalWindow(pathname: string) {
  (global as unknown as { window?: Window }).window = {
    location: { pathname, search: '', hash: '' } as Location,
    history: { pushState() {}, replaceState() {} } as unknown as History,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as Window;
}

function createRegistry() {
  return createRouteRegistry(() => {
    route('/{lang}/{page}', () => <main>{'lang-page'}</main>);
    route('/docs/{*rest}', () => <main>{'docs-splat'}</main>);
    route('/café', () => <main>{'cafe'}</main>);
    route('/a b', () => <main>{'space'}</main>);
    route('/@team', () => <main>{'reserved'}</main>);
    route('/files/*', () => (
      <main>{`file:${currentRoute().params['*']}`}</main>
    ));
    page(
      '/menü',
      () => <Outlet />,
      () => {
        index(() => <main>{'menu'}</main>);
        fallback(() => (
          <main>{`menu-missing:${currentRoute().params['*']}`}</main>
        ));
      }
    );
    fallback(() => <main>{`root-missing:${currentRoute().params['*']}`}</main>);
  });
}

const cases = [
  { url: '/docs/intro', expected: 'docs-splat' },
  { url: '/caf%C3%A9', expected: 'cafe' },
  { url: '/a%20b', expected: 'space' },
  { url: '/%40team', expected: 'reserved' },
  { url: '/files/caf%C3%A9', expected: 'file:café' },
  { url: '/men%C3%BC', expected: 'menu' },
  { url: '/men%C3%BC/a%20b/c', expected: 'menu-missing:/a b/c' },
  { url: '/nowhere/caf%C3%A9/x', expected: 'root-missing:/nowhere/café/x' },
] as const;

describe('route matching parity (client, SSR)', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    resetRouteState();
    const t = createTestContainer();
    container = t.container;
    cleanup = t.cleanup;
  });

  afterEach(() => {
    cleanup();
    delete (global as unknown as { window?: Window }).window;
  });

  for (const { url, expected } of cases) {
    it(`should render ${expected} for ${url} on the server`, () => {
      expect(renderToString({ url, registry: createRegistry() })).toBe(
        `<main>${expected}</main>`
      );
    });

    it(`should render ${expected} for ${url} on the client`, async () => {
      setGlobalWindow(url);
      await createSPA({ root: container, registry: createRegistry() });
      await flushScheduler();

      expect(container.textContent).toBe(expected);
    });
  }
});
