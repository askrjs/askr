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

test('should restore a custom property-to-attribute transition when a later write fails', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const config = { mode: 'property' };
  root.render(
    <>
      <x-prop-widget config={config} />
      <button data-mode="old" />
    </>
  );
  const widget = container.querySelector('x-prop-widget') as Widget &
    Record<string, unknown>;
  const button = container.querySelector('button')!;
  expect(widget.config).toBe(config);
  expect(widget.hasAttribute('config')).toBe(false);

  const setAttribute = button.setAttribute.bind(button);
  const failure = new Error('later write failed');
  const write = vi
    .spyOn(button, 'setAttribute')
    .mockImplementation((name, value) => {
      if (name === 'data-mode' && value === 'new') throw failure;
      setAttribute(name, value);
    });

  expect(() =>
    root.render(
      <>
        <x-prop-widget config="attribute" />
        <button data-mode="new" />
      </>
    )
  ).toThrow(failure);
  expect(widget.config).toBe(config);
  expect(widget.hasAttribute('config')).toBe(false);

  write.mockRestore();
  root.render(
    <>
      <x-prop-widget config="attribute" />
      <button data-mode="new" />
    </>
  );
  expect(widget.config).toBeUndefined();
  expect(widget.getAttribute('config')).toBe('attribute');

  root.dispose();
});

test('should roll back a custom setter that mutates before throwing', () => {
  const { container, root, el } = mount(<x-prop-widget prop:count={1} />);
  let count = 1;
  const failure = new Error('setter failed after mutation');
  Object.defineProperty(el, 'count', {
    configurable: true,
    get: () => count,
    set: (value: number) => {
      count = value;
      if (value === 2) throw failure;
    },
  });

  expect(() => root.render(<x-prop-widget prop:count={2} />)).toThrow(failure);
  expect(container.firstElementChild).toBe(el);
  expect(el.count).toBe(1);
  root.render(<x-prop-widget prop:count={3} />);
  expect(el.count).toBe(3);
  root.dispose();
});
