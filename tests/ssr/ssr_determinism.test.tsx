// tests/ssr/ssr_determinism.test.ts
import { describe, it, expect } from 'vitest';
import { renderToStringSync } from '../../src/index';

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
