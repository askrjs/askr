import { describe, it, expect } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
import type { JSXElement } from '../../../src/jsx/types';
import { state } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('SSR strict-purity guard (dev-only)', () => {
  it.each([false, true])(
    'should restore the surrounding hook cursor after a nested server render throws=%s',
    (fails) => {
      const view = createTestContainer();
      let revision!: ReturnType<typeof state<number>>;
      let retained!: ReturnType<typeof state<string>>;
      createIsland({
        root: view.container,
        component: () => {
          revision = state(0);
          const nestedRevision = revision();
          try {
            renderToStringSync(() => {
              if (nestedRevision === 0) state('server-only');
              if (fails) throw new Error('nested server failure');
              return <span>{'server'}</span>;
            });
          } catch (error) {
            if (!fails) throw error;
          }
          retained = state('retained');
          return <p>{retained()}</p>;
        },
      });
      try {
        flushScheduler();
        retained.set('updated');
        flushScheduler();
        revision.set(1);
        flushScheduler();
        expect(view.container.textContent).toBe('updated');
      } finally {
        view.cleanup();
      }
    }
  );

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
