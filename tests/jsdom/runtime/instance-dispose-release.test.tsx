import { expect, test } from 'vite-plus/test';
import { state } from '../../../src';
import { getCurrentInstance } from '../../../src/core/component/instance';
import { createRoot } from '../../../src/core/dom/root';

test('should release the rendered view and hook values when a component is disposed', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  let instance: ReturnType<typeof getCurrentInstance> = null;
  function Child() {
    instance = getCurrentInstance();
    const count = state(1);
    return <p>{count()}</p>;
  }
  root.render(<Child />);
  expect(instance!.view).not.toBeNull();
  expect(instance!.hooks.length).toBeGreaterThan(0);
  root.render(<div />);
  expect(instance!.disposed).toBe(true);
  expect(instance!.view).toBeNull();
  expect(instance!.hooks).toHaveLength(0);
  root.dispose();
});
