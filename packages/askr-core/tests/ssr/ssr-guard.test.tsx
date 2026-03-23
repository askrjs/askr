import { describe, it, expect } from 'vitest';
import { renderToStringSync } from '../../src/ssr';
import type { JSXElement } from '../../src/jsx/types';

describe('SSR strict-purity guard (dev-only)', () => {
  it('should allow nested SSR renders without leaking global overrides', () => {
    const Inner = () => (<div>inner</div>) as unknown as JSXElement;

    const Outer = () => {
      // Call SSR render synchronously during render of another component
      const html = renderToStringSync(Inner);
      return (<div>{html}</div>) as unknown as JSXElement;
    };
    // Should not throw and should produce expected HTML
    const out = renderToStringSync(Outer);
    expect(out).toContain('inner');
  });

  it('should throw when component directly calls Math.random during sync SSR', () => {
    const Bad = () => {
      // Direct call should be disallowed by the dev guard
      (Math as unknown as { random: () => number }).random();
      return (<div />) as unknown as JSXElement;
    };

    expect(() => renderToStringSync(Bad)).toThrow(/SSR Strict Purity/);
  });

  it('should restore Math.random after render', () => {
    const Before = Math.random();
    renderToStringSync(() => (<div>ok</div>) as unknown as JSXElement);
    const After = Math.random();
    // Both should be numbers between 0 and 1
    expect(typeof Before).toBe('number');
    expect(typeof After).toBe('number');
  });
});
