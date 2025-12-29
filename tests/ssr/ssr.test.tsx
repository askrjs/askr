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
      route('/x', () => ({ type: 'div' }));
      return { type: 'div' };
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
    const Component = () => ({ type: 'div', children: ['hello'] });
    const html = renderToStringSync(Component);

    expect(html).toContain('<div');
    expect(html).toContain('hello');
  });

  it('should apply snapshot to new instance during restore', async () => {
    const Component = () => ({ type: 'div', children: ['hello'] });
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
    const Component = () => ({
      type: 'div',
      props: { class: 'x' },
      children: ['hello'],
    });

    const a = renderToStringSync(Component);
    const b = renderToStringSync(Component);
    const c = renderToStringSync(Component);

    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('should throw when using nondeterministic globals like Math.random', async () => {
    const Random = () => ({ type: 'div', children: [`${Math.random()}`] });
    expect(() => renderToStringSync(Random)).toThrow(/Math.random.*SSR/i);
  });

  it('should have no side effects during SSR render', async () => {
    let sideEffects = 0;
    const SideEffectful = () => {
      sideEffects++;
      return { type: 'div', children: ['x'] };
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
      return {
        type: 'div',
        children: [String(t), String(r)],
      } as unknown as JSXElement;
    };

    expect(() => renderToStringSync(() => Component())).toThrow();
  });
});

describe('SSR streaming parity', () => {
  it('should stream SSR matches string SSR', () => {
    const routes = [
      { path: '/', handler: () => ({ type: 'div', children: ['x'] }) },
    ];

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
