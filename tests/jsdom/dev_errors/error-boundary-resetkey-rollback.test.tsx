import { describe, expect, it, vi } from 'vite-plus/test';
import { ErrorBoundary } from '../../../src/components';
import { createRoot } from '../../../src/core/dom/root';

describe('ErrorBoundary resetKey rollback', () => {
  it('should keep the boundary caught when a reset retry fails', () => {
    const onError = vi.fn();

    function Broken() {
      throw new Error('child failed');
    }

    function App(props: { resetKey: string }) {
      return (
        <ErrorBoundary
          resetKey={props.resetKey}
          onError={onError}
          fallback={<p>fallback</p>}
        >
          <Broken />
        </ErrorBoundary>
      );
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      root.render(<App resetKey="old" />);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(container.textContent).toBe('fallback');

      root.render(<App resetKey="new" />);

      expect(onError).toHaveBeenCalledTimes(2);
      expect(container.textContent).toBe('fallback');
    } finally {
      root.dispose();
    }
  });

  it('should retain caught state when a resetKey render is discarded', () => {
    const onError = vi.fn();

    function Broken(props: { fail: boolean }) {
      if (props.fail) throw new Error('child failed');
      return <p>child</p>;
    }

    function Bomb(props: { fail: boolean }) {
      if (props.fail) throw new Error('sibling failed');
      return <p>sibling</p>;
    }

    function App(props: {
      resetKey: string;
      childFail: boolean;
      siblingFail: boolean;
    }) {
      return (
        <>
          <ErrorBoundary
            resetKey={props.resetKey}
            onError={onError}
            fallback={<p>fallback</p>}
          >
            <Broken fail={props.childFail} />
          </ErrorBoundary>
          <Bomb fail={props.siblingFail} />
        </>
      );
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      root.render(<App resetKey="old" childFail={true} siblingFail={false} />);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain('fallback');

      expect(() =>
        root.prepare(
          <App resetKey="new" childFail={false} siblingFail={true} />
        )
      ).toThrow('sibling failed');

      root.render(<App resetKey="old" childFail={true} siblingFail={false} />);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain('fallback');
    } finally {
      root.dispose();
      vi.restoreAllMocks();
    }
  });
});
