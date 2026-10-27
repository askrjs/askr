import { expect, test, vi } from 'vite-plus/test';
import { logger } from '../../../src/common/logger';
import { createRoot } from '../../../src/core/dom/root';

function view(html: string, extra = 0) {
  return (
    <div data-extra={extra}>
      <p dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

test('should warn once per element however often it re-renders', () => {
  const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    root.render(view('<b>a</b>'));
    root.render(view('<b>a</b>', 1));
    root.render(view('<b>b</b>', 2));
    const first = warn.mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes('dangerouslySetInnerHTML')
    );
    expect(first).toHaveLength(1);
    root.render(
      <div>
        <p dangerouslySetInnerHTML={{ __html: 'x' }} />
        <p dangerouslySetInnerHTML={{ __html: 'y' }} />
      </div>
    );
    const all = warn.mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes('dangerouslySetInnerHTML')
    );
    expect(all.length).toBeGreaterThan(1);
  } finally {
    warn.mockRestore();
    root.dispose();
  }
});

test('should not read innerHTML when the html string did not change', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(view('<b>a</b>'));
  const getter = vi.spyOn(Element.prototype, 'innerHTML', 'get');
  try {
    root.render(view('<b>a</b>', 1));
    root.render(view('<b>a</b>', 2));
    expect(getter).not.toHaveBeenCalled();
  } finally {
    getter.mockRestore();
    root.dispose();
  }
});

test('should write the new html when the string changes', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(view('<b>a</b>'));
  root.render(view('<i>b</i>', 1));
  expect(container.querySelector('p')!.innerHTML).toBe('<i>b</i>');
  root.dispose();
});
