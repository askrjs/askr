import { afterEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { cleanupApp, hydrateSPA } from '../../../src/boot';
import { Link } from '../../../src/components/link';
import { For } from '../../../src/control';
import { renderToStringSync } from '../../../src/ssr';
import { flushScheduler } from '../../../test-utils/render/test-renderer';
import {
  resetRouteState,
  routeRegistryFromTable,
} from '../../router-test-utils';

describe('For hydration after a static sibling', () => {
  let root: HTMLElement | undefined;

  afterEach(() => {
    if (root) {
      cleanupApp(root);
      root.remove();
      root = undefined;
    }
    resetRouteState();
  });

  it('should adopt only the keyed For range and preserve later updates', async () => {
    const initialPages = Array.from({ length: 7 }, (_, index) => ({
      path: `/page-${index + 1}`,
      label: `Page ${index + 1}`,
    }));
    let replacePages = (_pages: typeof initialPages) => {};

    const FooterLinks = (props: { children?: unknown }) => (
      <nav>{props.children}</nav>
    );

    const App = () => {
      const pages = state(initialPages);
      replacePages = (next) => pages.set(next);

      return (
        <footer>
          <FooterLinks>
            <Link href="/" data-overview>
              Overview
            </Link>
            <For each={pages} by={(page) => page.path}>
              {(page) => (
                <Link key={page.path} href={page.path} data-page={page.path}>
                  {page.label}
                </Link>
              )}
            </For>
          </FooterLinks>
          <nav data-control>
            <For each={pages} by={(page) => page.path}>
              {(page) => (
                <Link
                  key={page.path}
                  href={page.path}
                  data-control-page={page.path}
                >
                  {page.label}
                </Link>
              )}
            </For>
          </nav>
        </footer>
      );
    };

    root = document.createElement('div');
    document.body.appendChild(root);
    root.innerHTML = renderToStringSync(App);

    const footer = root.querySelector('footer')!;
    const linksWithStaticSibling = footer.querySelector(
      'nav:not([data-control])'
    )!;
    const control = footer.querySelector('[data-control]')!;
    const serverOverview =
      linksWithStaticSibling.querySelector('[data-overview]');
    const serverPages = Array.from(
      linksWithStaticSibling.querySelectorAll('[data-page]')
    );
    const serverControlPages = Array.from(
      control.querySelectorAll('[data-control-page]')
    );

    await hydrateSPA({
      root,
      registry: routeRegistryFromTable([{ path: '/', handler: App }]),
    });

    expect(linksWithStaticSibling.querySelectorAll(':scope > a')).toHaveLength(
      8
    );
    expect(control.querySelectorAll(':scope > a')).toHaveLength(7);
    expect(linksWithStaticSibling.querySelector('[data-overview]')).toBe(
      serverOverview
    );
    expect(
      Array.from(linksWithStaticSibling.querySelectorAll('[data-page]'))
    ).toEqual(serverPages);
    expect(Array.from(control.querySelectorAll('[data-control-page]'))).toEqual(
      serverControlPages
    );

    replacePages([
      initialPages[6]!,
      initialPages[2]!,
      initialPages[0]!,
      initialPages[4]!,
    ]);
    flushScheduler();

    expect(
      Array.from(
        linksWithStaticSibling.querySelectorAll('[data-page]'),
        (link) => link.getAttribute('data-page')
      )
    ).toEqual(['/page-7', '/page-3', '/page-1', '/page-5']);
    expect(
      Array.from(control.querySelectorAll('[data-control-page]'), (link) =>
        link.getAttribute('data-control-page')
      )
    ).toEqual(['/page-7', '/page-3', '/page-1', '/page-5']);
    expect(linksWithStaticSibling.querySelector('[data-overview]')).toBe(
      serverOverview
    );
    expect(linksWithStaticSibling.querySelector('[data-page="/page-7"]')).toBe(
      serverPages[6]
    );
    expect(control.querySelector('[data-control-page="/page-7"]')).toBe(
      serverControlPages[6]
    );
  });
});
