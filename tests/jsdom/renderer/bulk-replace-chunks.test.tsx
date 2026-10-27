import { expect, test, vi } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

test('should write a very large first render in argument-safe chunks', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const replace = vi.spyOn(Element.prototype, 'replaceChildren');
  const append = vi.spyOn(Element.prototype, 'append');
  try {
    const items = Array.from({ length: 25_000 }, (_, i) => <i key={i} />);
    root.render(<>{items}</>);
    expect(container.childNodes.length).toBe(25_000);
    const widest = Math.max(
      0,
      ...replace.mock.calls.map((call: unknown[]) => call.length),
      ...append.mock.calls.map((call: unknown[]) => call.length)
    );
    expect(widest).toBeLessThanOrEqual(10_000);
  } finally {
    vi.restoreAllMocks();
    root.dispose();
  }
});
