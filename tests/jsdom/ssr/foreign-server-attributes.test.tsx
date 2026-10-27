import { expect, test } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

function serverMarkup(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

test('should keep server attributes the client never renders when hydrating', () => {
  const container = serverMarkup(
    '<div id="a" data-theme="dark" data-extension-id="x">hi</div>'
  );
  const el = container.firstElementChild!;
  const root = createRoot(container, { hydrate: true });
  root.render(<div id="a">hi</div>);
  expect(container.firstElementChild).toBe(el);
  expect(el.getAttribute('data-theme')).toBe('dark');
  expect(el.getAttribute('data-extension-id')).toBe('x');
  root.dispose();
});

test('should remove renderer bookkeeping attributes when hydrating', () => {
  const container = serverMarkup(
    '<div id="a" data-key="1" data-askr-key-kind="n">hi</div>'
  );
  const el = container.firstElementChild!;
  const root = createRoot(container, { hydrate: true });
  root.render(<div id="a">hi</div>);
  expect(el.hasAttribute('data-key')).toBe(false);
  expect(el.hasAttribute('data-askr-key-kind')).toBe(false);
  root.dispose();
});

test('should remove a server attribute the client names with a nullish value', () => {
  const container = serverMarkup(
    '<div id="a" title="old" data-x="1" data-keep="k">hi</div>'
  );
  const el = container.firstElementChild!;
  const root = createRoot(container, { hydrate: true });
  root.render(
    <div id="a" title={undefined} data-x={null}>
      hi
    </div>
  );
  expect(el.hasAttribute('title')).toBe(false);
  expect(el.hasAttribute('data-x')).toBe(false);
  expect(el.getAttribute('data-keep')).toBe('k');
  root.dispose();
});

test('should remove every attribute the client does not render in strict mode', () => {
  const container = serverMarkup('<div id="a" data-theme="dark">hi</div>');
  const el = container.firstElementChild!;
  const root = createRoot(container, {
    hydrate: true,
    hydrateOptions: { strict: true },
  });
  root.render(<div id="a">hi</div>);
  expect(el.hasAttribute('data-theme')).toBe(false);
  expect(el.getAttribute('id')).toBe('a');
  root.dispose();
});
