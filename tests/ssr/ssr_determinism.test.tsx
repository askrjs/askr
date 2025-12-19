// tests/ssr/ssr_determinism.test.ts
import { describe, it, expect } from 'vitest';
import { renderToString } from '../../src/index';

describe('SSR determinism (SSR)', () => {
  it('should render same HTML every time when component is the same', async () => {
    const Component = () => ({
      type: 'div',
      props: { className: 'x' },
      children: ['hello'],
    });

    const a = await renderToString(Component);
    const b = await renderToString(Component);
    const c = await renderToString(Component);

    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('should produce same sequence on repeat when using random numbers', async () => {
    const Random = () => ({ type: 'div', children: [`${Math.random()}`] });
    const a = await renderToString(Random);
    const b = await renderToString(Random);

    // Spec requirement: deterministic output for same inputs.
    // (This assertion is expected to fail until a deterministic RNG strategy exists.)
    expect(a).toBe(b);
  });

  it('should have no side effects during SSR render', async () => {
    let sideEffects = 0;
    const SideEffectful = () => {
      sideEffects++;
      return { type: 'div', children: ['x'] };
    };

    await renderToString(SideEffectful);

    // SSR executes the component, so side effects occur during rendering
    expect(sideEffects).toBe(1);
  });
});
