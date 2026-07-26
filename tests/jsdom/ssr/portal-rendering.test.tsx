import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  DefaultPortal,
  Portal,
  _resetDefaultPortal,
  definePortal,
} from '../../../src/foundations/structures/portal';
import { hydrateSPA } from '../../../src/boot';
import { renderToStringSync } from '../../../src/ssr';
import { routeRegistryFromTable } from '../../router-test-utils';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('SSR portal rendering', () => {
  beforeEach(() => {
    _resetDefaultPortal();
  });

  afterEach(() => {
    _resetDefaultPortal();
  });

  it('should render default portal content at an explicit host after its writer', () => {
    const html = renderToStringSync(() => (
      <main>
        <Portal>
          <div class="overlay">{'Portalled'}</div>
        </Portal>
        <DefaultPortal />
      </main>
    ));

    expect(html).toBe('<main><div class="overlay">Portalled</div></main>');
  });

  it('should render default portal content at an explicit host before its writer', () => {
    const html = renderToStringSync(() => (
      <main>
        <DefaultPortal />
        <span>{'middle'}</span>
        <Portal>
          <div class="overlay">{'Portalled'}</div>
        </Portal>
      </main>
    ));

    expect(html).toBe(
      '<main><div class="overlay">Portalled</div><span>middle</span></main>'
    );
  });

  it('should render default portal content at the automatic host', () => {
    const html = renderToStringSync(() => (
      <main>
        <Portal>
          <div class="overlay">{'Portalled'}</div>
        </Portal>
      </main>
    ));

    expect(html).toBe('<main></main><div class="overlay">Portalled</div>');
  });

  it('should insert portal HTML containing replacement tokens verbatim', () => {
    const html = renderToStringSync(() => (
      <main>
        <Portal>
          <div>{"cash $& $1 $$ $` $'"}</div>
        </Portal>
        <DefaultPortal />
      </main>
    ));

    expect(html).toBe("<main><div>cash $&amp; $1 $$ $` $'</div></main>");
  });

  it('should render a defined portal independent of host evaluation order', () => {
    const EarlyHost = definePortal();
    const LateHost = definePortal();
    const EarlyWriter = () =>
      EarlyHost.render({ children: <strong>{'early-host'}</strong> });
    const LateWriter = () =>
      LateHost.render({ children: <strong>{'late-host'}</strong> });

    const hostBeforeWriter = renderToStringSync(() => (
      <main>
        <EarlyHost />
        <EarlyWriter />
      </main>
    ));
    const writerBeforeHost = renderToStringSync(() => (
      <main>
        <LateWriter />
        <LateHost />
      </main>
    ));

    expect(hostBeforeWriter).toBe('<main><strong>early-host</strong></main>');
    expect(writerBeforeHost).toBe('<main><strong>late-host</strong></main>');
  });

  it('should isolate defined portal state between server render roots', () => {
    const OverlayPortal = definePortal();
    const Writer = () =>
      OverlayPortal.render({ children: <strong>{'first'}</strong> });

    const first = renderToStringSync(() => (
      <main>
        <Writer />
        <OverlayPortal />
      </main>
    ));
    const second = renderToStringSync(() => (
      <main>
        <OverlayPortal />
      </main>
    ));

    expect(first).toBe('<main><strong>first</strong></main>');
    expect(second).toBe('<main></main>');
  });

  it('should hydrate server-rendered default portal content', async () => {
    const { container, cleanup } = createTestContainer();
    let clicks = 0;
    const Page = () => (
      <main>
        <Portal>
          <button id="portal-action" onClick={() => (clicks += 1)}>
            {'act'}
          </button>
        </Portal>
        <DefaultPortal />
      </main>
    );
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      container.innerHTML = renderToStringSync(Page);
      await hydrateSPA({ root: container, registry });
      flushScheduler();

      const button = container.querySelector(
        '#portal-action'
      ) as HTMLButtonElement;
      expect(button).not.toBeNull();
      button.click();
      expect(clicks).toBe(1);
    } finally {
      cleanup();
    }
  });
});
