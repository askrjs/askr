import { afterEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { hydrateSPA } from '../../../src/boot';
import { _resetDefaultPortal } from '../../../src/foundations/structures/portal';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';

function markup(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function elementTags(root: Element): string[] {
  return Array.from(root.querySelectorAll('*'), (element) =>
    element.tagName.toLowerCase()
  );
}

describe('hydrated component that is empty on the server', () => {
  afterEach(() => {
    _resetDefaultPortal();
  });

  it('should render later text and fragments in place of the server placeholder', async () => {
    let initial = false;
    let setText!: (value: boolean) => void;
    let setList!: (value: boolean) => void;
    function Text() {
      const shown = state(initial);
      setText = shown.set;
      return shown() ? 'hello' : null;
    }
    function List() {
      const shown = state(initial);
      setList = shown.set;
      return shown() ? (
        <>
          {'a'}
          <b>{'b'}</b>
        </>
      ) : null;
    }
    function App() {
      return (
        <main>
          <Text />
          <List />
          <i data-tail={'true'}>{'tail'}</i>
        </main>
      );
    }

    _resetDefaultPortal();
    initial = true;
    const shownMarkup = markup(renderToStringSync(App));
    initial = false;
    _resetDefaultPortal();
    const { container, cleanup } = createTestContainer();
    try {
      container.innerHTML = renderToStringSync(App);
      const emptyMarkup = markup(container.innerHTML);
      const main = container.querySelector('main');
      const tail = container.querySelector('[data-tail]');
      _resetDefaultPortal();

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: App }]),
        hydrate: { verifyMarkup: true },
      });
      flushScheduler();
      expect(markup(container.innerHTML)).toBe(emptyMarkup);

      setText(true);
      setList(true);
      flushScheduler();

      expect(container.querySelector('main')).toBe(main);
      expect(container.querySelector('[data-tail]')).toBe(tail);
      expect(elementTags(main!)).toEqual(['b', 'i']);
      expect(markup(container.innerHTML)).toBe(shownMarkup);

      setText(false);
      setList(false);
      flushScheduler();
      expect(markup(container.innerHTML)).toBe(emptyMarkup);
    } finally {
      cleanup();
    }
  });
});
