import { describe, expect, it, vi } from 'vite-plus/test';
import { ErrorBoundary } from '../../../src/components';
import { createRoot } from '../../../src/core/dom/root';
import { routeError } from '../../../src/core/component/errors';
import type { ComponentInstance } from '../../../src/core/component/instance';
import {
  COMPONENT,
  DYNAMIC,
  FRAGMENT,
  HOST,
  type RNode,
} from '../../../src/core/dom/tree';
import { flushScheduler } from '../../../test-utils/render/test-renderer';

describe('ErrorBoundary callback rollback', () => {
  it('should retain the committed onError callback after a discarded render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const committedOnError = vi.fn();
    const discardedOnError = vi.fn();

    function Broken() {
      return <p>ready</p>;
    }

    function App(props: { onError: (error: unknown) => void }) {
      return (
        <ErrorBoundary onError={props.onError} fallback={<p>fallback</p>}>
          <Broken />
        </ErrorBoundary>
      );
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      root.render(<App onError={committedOnError} />);
      const app = root.node.children[0];
      if (app?.kind !== COMPONENT) throw new Error('App did not render');
      const boundary = app.children[0];
      if (boundary?.kind !== COMPONENT) {
        throw new Error('ErrorBoundary did not render');
      }
      const committedHandler = boundary.instance.boundary;
      const prepared = root.prepare(<App onError={discardedOnError} />);
      const preparedHandler = boundary.instance.boundary;
      expect(preparedHandler).not.toBe(committedHandler);
      prepared.discard();
      const findDescendant = (
        nodes: readonly RNode[]
      ): ComponentInstance | null => {
        for (const node of nodes) {
          if (node.kind === COMPONENT) return node.instance;
          if (
            node.kind === HOST ||
            node.kind === FRAGMENT ||
            node.kind === DYNAMIC
          ) {
            const found = findDescendant(node.children);
            if (found) return found;
          }
        }
        return null;
      };
      const broken = findDescendant(boundary.children);
      expect(broken).not.toBeNull();
      routeError(broken, new Error('scheduled failure'));
      expect(committedOnError).toHaveBeenCalledTimes(1);
      expect(discardedOnError).not.toHaveBeenCalled();
      flushScheduler();
      expect(container.textContent).toBe('fallback');
    } finally {
      root.dispose();
      vi.restoreAllMocks();
    }
  });
});
