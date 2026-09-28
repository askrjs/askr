import { allowFrameworkWarnings } from '../../setup-env';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { ErrorBoundary } from '@askrjs/askr/components';
import { state } from '../../../src';
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

    expect(html).toBe(
      '<main><!--askr-portal-anchor:0--><!--askr-range-start--><div class="overlay">Portalled</div><!--askr-range-end--></main>'
    );
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
      '<main><!--askr-range-start--><div class="overlay">Portalled</div><!--askr-range-end--><span>middle</span><!--askr-portal-anchor:1--></main>'
    );
  });

  it('should render all default portal writers in source order', () => {
    const html = renderToStringSync(() => (
      <main>
        <DefaultPortal />
        <Portal>
          <i>{'first'}</i>
        </Portal>
        <Portal>
          <b>{'second'}</b>
        </Portal>
      </main>
    ));

    expect(html).toBe(
      '<main><!--askr-range-start--><i>first</i><b>second</b><!--askr-range-end--><!--askr-portal-anchor:1--><!--askr-portal-anchor:2--></main>'
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

    expect(html).toBe(
      '<main><!--askr-portal-anchor:0--></main><!--askr-range-start--><div class="overlay">Portalled</div><!--askr-range-end-->'
    );
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

    expect(html).toBe(
      "<main><!--askr-portal-anchor:0--><!--askr-range-start--><div>cash $&amp; $1 $$ $` $'</div><!--askr-range-end--></main>"
    );
  });

  describe('inside an ErrorBoundary that renders its fallback', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function Failure(): never {
      throw new Error('ssr failure');
    }

    it('should not emit default portal content written by the failed subtree', () => {
      const html = renderToStringSync(() => (
        <main>
          <DefaultPortal />
          <ErrorBoundary fallback={<p>{'fallback'}</p>}>
            <Portal>
              <aside>{'leaked'}</aside>
            </Portal>
            <Failure />
          </ErrorBoundary>
        </main>
      ));

      expect(html).not.toContain('leaked');
      expect(html).toContain('<p>fallback</p>');
    });

    it('should keep an earlier write from outside the boundary', () => {
      const html = renderToStringSync(() => (
        <main>
          <DefaultPortal />
          <Portal>
            <aside>{'outer'}</aside>
          </Portal>
          <ErrorBoundary fallback={<p>{'fallback'}</p>}>
            <Portal>
              <aside>{'leaked'}</aside>
            </Portal>
            <Failure />
          </ErrorBoundary>
        </main>
      ));

      expect(html).not.toContain('leaked');
      expect(html).toContain('<aside>outer</aside>');
    });

    it('should not emit named portal content written by the failed subtree', () => {
      const Overlay = definePortal();
      const Writer = () =>
        Overlay.render({ children: <aside>{'leaked'}</aside> });
      const html = renderToStringSync(() => (
        <main>
          <Overlay />
          <ErrorBoundary fallback={<p>{'fallback'}</p>}>
            <Writer />
            <Failure />
          </ErrorBoundary>
        </main>
      ));

      expect(html).not.toContain('leaked');
    });

    it('should keep the portal claimed when the failed subtree held the only explicit host', () => {
      // Matches the client: a host replaced by a fallback keeps the portal
      // claimed, so content does not move to the automatic host.
      const html = renderToStringSync(() => (
        <main>
          <Portal>
            <aside>{'content'}</aside>
          </Portal>
          <ErrorBoundary fallback={<p>{'fallback'}</p>}>
            <DefaultPortal />
            <Failure />
          </ErrorBoundary>
        </main>
      ));

      expect(html).toContain('<p>fallback</p>');
      expect(html).not.toContain('content');
    });
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

  it('should render every defined-portal writer in source order', () => {
    const Overlay = definePortal();
    const FirstWriter = () => Overlay.render({ children: <i>{'first'}</i> });
    const SecondWriter = () => Overlay.render({ children: <b>{'second'}</b> });

    const html = renderToStringSync(() => (
      <main>
        <Overlay />
        <FirstWriter />
        <SecondWriter />
      </main>
    ));

    expect(html).toBe('<main><i>first</i><b>second</b></main>');
  });

  it('should collect nested writers while resolving portal content', () => {
    const Outer = definePortal();
    const Inner = definePortal();
    const InnerWriter = () => Inner.render({ children: <em>{'nested'}</em> });
    const OuterWriter = () =>
      Outer.render({
        children: (
          <section>
            <InnerWriter />
            <Inner />
          </section>
        ),
      });

    const html = renderToStringSync(() => (
      <main>
        <Outer />
        <OuterWriter />
      </main>
    ));

    expect(html).toBe('<main><section><em>nested</em></section></main>');
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

  it('should hydrate every writer when the host appears between writers', async () => {
    const Overlay = definePortal();
    let setSecond!: (value: string) => void;
    const FirstWriter = () =>
      Overlay.render({ children: <i data-layer="first">{'first'}</i> });
    const SecondWriter = () => {
      const label = state('second');
      setSecond = label.set;
      return Overlay.render({
        children: <b data-layer="second">{label()}</b>,
      });
    };
    const Page = () => (
      <main>
        <FirstWriter />
        <Overlay />
        <SecondWriter />
      </main>
    );
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      container.innerHTML = renderToStringSync(Page);
      const first = container.querySelector('[data-layer="first"]');
      const second = container.querySelector('[data-layer="second"]');
      await hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: true },
      });
      flushScheduler();

      expect(container.querySelector('[data-layer="first"]')).toBe(first);
      expect(container.querySelector('[data-layer="second"]')).toBe(second);
      setSecond('updated');
      flushScheduler();
      expect(container.querySelector('[data-layer="first"]')).toBe(first);
      expect(second?.textContent).toBe('updated');
    } finally {
      cleanup();
    }
  });

  it('should adopt keyed portal host content across SSR and hydration', async () => {
    const Overlay = definePortal();
    let clicks = 0;
    const Writer = () =>
      Overlay.render({
        children: (
          <button data-portal-action={'true'} onClick={() => (clicks += 1)}>
            {'act'}
          </button>
        ),
      });
    const Page = () => (
      <main>
        <Writer />
        <Overlay key={'overlay'} />
      </main>
    );
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);
    try {
      container.innerHTML = renderToStringSync(Page);
      const serverButton = container.querySelector('[data-portal-action]');
      expect(serverButton).not.toBeNull();

      await hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: true },
      });
      flushScheduler();

      const clientButton = container.querySelector('[data-portal-action]');
      expect(clientButton).toBe(serverButton);
      (clientButton as HTMLButtonElement).click();
      expect(clicks).toBe(1);
    } finally {
      cleanup();
    }
  });

  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])(
    'should retain named portal content when keyed=%s and writerFirst=%s',
    async (keyed, writerFirst) => {
      if (!keyed) {
        allowFrameworkWarnings(/Missing keys on dynamic lists in Page/);
      }
      const Overlay = definePortal();
      let setLabel!: (value: string) => void;
      let clicks = 0;
      const Writer = (props: { label: string }) =>
        Overlay.render({
          children: (
            <button data-named-action onClick={() => (clicks += 1)}>
              {props.label}
            </button>
          ),
        });
      const Page = () => {
        const label = state('first');
        setLabel = label.set;
        const host = <Overlay key={keyed ? 'overlay' : undefined} />;
        const writer = <Writer label={label()} />;
        return <main>{writerFirst ? [writer, host] : [host, writer]}</main>;
      };
      const { container, cleanup } = createTestContainer();

      try {
        container.innerHTML = renderToStringSync(Page);
        const serverButton = container.querySelector('[data-named-action]');
        await hydrateSPA({
          root: container,
          registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
          hydrate: { verifyMarkup: true },
        });
        expect(container.querySelector('[data-named-action]')).toBe(
          serverButton
        );
        (serverButton as HTMLButtonElement).click();
        expect(clicks).toBe(1);

        setLabel('second');
        flushScheduler();
        expect(container.querySelector('[data-named-action]')).toBe(
          serverButton
        );
        expect(serverButton?.textContent).toBe('second');
      } finally {
        cleanup();
      }
    }
  );
});
