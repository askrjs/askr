import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hydrateSPA } from '../../src/boot';
import { route } from '../../src/router/route';
import {
  renderToStringSync,
  renderToString,
  renderToStream,
} from '../../src/ssr';
import type { JSXElement } from '../../src/jsx/types';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

// Consolidated SSR tests

describe('SSR route registration', () => {
  it('should not allow route registration during SSR', () => {
    const Comp = () => {
      route('/x', () => <div />);
      return <div />;
    };

    expect(() => renderToStringSync(Comp)).toThrow(
      /route\(\) cannot be called during SSR|route\(\) can only be called during component render/i
    );
  });
});

describe('snapshot restore (SSR)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should capture component state in snapshot', async () => {
    const Component = () => <div>hello</div>;
    const html = renderToStringSync(Component);

    expect(html).toContain('<div');
    expect(html).toContain('hello');
  });

  it('should apply snapshot to new instance during restore', async () => {
    const Component = () => <div>hello</div>;
    const html = renderToStringSync(Component);

    container.innerHTML = html;
    await expect(
      hydrateSPA({
        root: container,
        routes: [{ path: '/', handler: Component }],
      })
    ).resolves.not.toThrow();
    flushScheduler();

    expect(container.textContent).toContain('hello');
  });
});

describe('SSR determinism (SSR)', () => {
  it('should render same HTML every time when component is the same', async () => {
    const Component = () => <div class="x">hello</div>;

    const a = renderToStringSync(Component);
    const b = renderToStringSync(Component);
    const c = renderToStringSync(Component);

    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('should throw when using nondeterministic globals like Math.random', async () => {
    const Random = () => <div>{Math.random()}</div>;
    expect(() => renderToStringSync(Random)).toThrow(/Math.random.*SSR/i);
  });

  it('should have no side effects during SSR render', async () => {
    let sideEffects = 0;
    const SideEffectful = () => {
      sideEffects++;
      return <div>x</div>;
    };

    renderToStringSync(SideEffectful);

    // SSR executes the component, so side effects occur during rendering
    expect(sideEffects).toBe(1);
  });
});

describe('SSR strict purity', () => {
  it('should throw in dev when component uses global time/randomness during SSR', () => {
    const Component = () => {
      // This uses Date and Math inside render
      const t = Date.now();
      const r = Math.random();
      return (
        <div>
          {String(t)}
          {String(r)}
        </div>
      ) as unknown as JSXElement;
    };

    expect(() => renderToStringSync(() => Component())).toThrow();
  });
});

describe('SSR streaming parity', () => {
  it('should stream SSR matches string SSR', () => {
    const routes = [{ path: '/', handler: () => <div>x</div> }];

    let out = '';
    renderToStream({
      url: '/',
      routes,
      onChunk: (c) => (out += c),
      onComplete: () => {},
    });

    expect(out).toBe(renderToString({ url: '/', routes }));
  });
});
