import { expect, test, vi } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

function mount(value: unknown) {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(value);
  return { container, root };
}

test('should run the cleanup a ref callback returned when the element unmounts', () => {
  const cleanup = vi.fn();
  const ref = vi.fn(() => cleanup);
  const { container, root } = mount(<p ref={ref}>x</p>);
  expect(ref).toHaveBeenCalledTimes(1);
  expect(ref).toHaveBeenLastCalledWith(container.firstElementChild);
  expect(cleanup).not.toHaveBeenCalled();
  root.render(<div />);
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(ref).toHaveBeenCalledTimes(1);
  root.dispose();
});

test('should call a ref with null when it returned no cleanup', () => {
  const ref = vi.fn();
  const { root } = mount(<p ref={ref}>x</p>);
  root.render(<div />);
  expect(ref).toHaveBeenCalledTimes(2);
  expect(ref).toHaveBeenLastCalledWith(null);
  root.dispose();
});

test('should run the previous cleanup and attach the new ref when the ref changes', () => {
  const firstCleanup = vi.fn();
  const first = vi.fn(() => firstCleanup);
  const second = vi.fn();
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(<p ref={first}>x</p>);
  root.render(<p ref={second}>x</p>);
  expect(firstCleanup).toHaveBeenCalledTimes(1);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledWith(container.firstElementChild);
  root.dispose();
});

test('should run the cleanup when the root disposes', () => {
  const cleanup = vi.fn();
  const { root } = mount(<p ref={() => cleanup}>x</p>);
  root.dispose();
  expect(cleanup).toHaveBeenCalledTimes(1);
});
