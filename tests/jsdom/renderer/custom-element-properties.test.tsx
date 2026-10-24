import { expect, test, vi } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';
import { renderToStringSync } from '../../../src/ssr';

class Widget extends HTMLElement {
  open = false;
  count = 0;
  label = '';
  formatter: unknown = null;
  items: unknown = null;
}
customElements.define('x-prop-widget', Widget);

function mount(value: unknown) {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(value);
  return { container, root, el: container.firstElementChild as Widget };
}

test('should assign a boolean as a property when the element has it', () => {
  const { el, root } = mount(<x-prop-widget open={true} />);
  expect(el.open).toBe(true);
  expect(el.hasAttribute('open')).toBe(false);
  root.dispose();
});

test('should assign a number as a property when the element has it', () => {
  const { el, root } = mount(<x-prop-widget count={3} />);
  expect(el.count).toBe(3);
  expect(el.hasAttribute('count')).toBe(false);
  root.dispose();
});

test('should keep a string as an attribute even when the element has the property', () => {
  const { el, root } = mount(<x-prop-widget label="hello" />);
  expect(el.getAttribute('label')).toBe('hello');
  root.dispose();
});

test('should keep a boolean as an attribute when the element has no such property', () => {
  const { el, root } = mount(<x-prop-widget extra={true} />);
  expect(el.hasAttribute('extra')).toBe(true);
  root.dispose();
});

test('should keep a boolean as an attribute on an element that is not defined', () => {
  const { container, root } = mount(<x-undefined-widget open={true} />);
  expect(container.firstElementChild!.hasAttribute('open')).toBe(true);
  root.dispose();
});

test('should assign a function given prop: as is instead of calling it', () => {
  const formatter = vi.fn(() => 'x');
  const { el, root } = mount(<x-prop-widget prop:formatter={formatter} />);
  expect(el.formatter).toBe(formatter);
  expect(formatter).not.toHaveBeenCalled();
  root.dispose();
});

test('should replace a function given prop: on update', () => {
  const first = () => 'a';
  const second = () => 'b';
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(<x-prop-widget prop:formatter={first} />);
  const el = container.firstElementChild as Widget;
  root.render(<x-prop-widget prop:formatter={second} />);
  expect(el.formatter).toBe(second);
  root.dispose();
});

test('should still assign an array as a property', () => {
  const items = [1, 2];
  const { el, root } = mount(<x-prop-widget items={items} />);
  expect(el.items).toBe(items);
  root.dispose();
});

test('should leave a boolean as an attribute on the server', () => {
  expect(renderToStringSync(() => <x-prop-widget open={true} />)).toContain(
    'open'
  );
});
