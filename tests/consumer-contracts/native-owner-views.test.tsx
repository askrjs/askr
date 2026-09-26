import { expect, test, vi } from 'vitest';
import { state, type State } from '@askrjs/askr';
import {
  getDefaultRuntime,
  type RuntimeRendererHost,
} from '@askrjs/askr/experimental';
import { cleanupApp, createIsland } from '@askrjs/askr/boot';

type Owner = NonNullable<Parameters<RuntimeRendererHost['evaluate']>[3]>;

test('should preserve reader owner views without configuring an extension host', () => {
  // Observe the owners handed to the native host without replacing it.
  const renderer = getDefaultRuntime().renderer;
  const evaluate = renderer.evaluate;
  const owners = new Set<Owner>();
  const spy = vi.spyOn(renderer, 'evaluate').mockImplementation(function (
    this: RuntimeRendererHost,
    ...args
  ) {
    if (args[3]) owners.add(args[3]);
    return evaluate.apply(this, args);
  });
  const root = document.createElement('main');
  let value!: State<number>;
  try {
    createIsland({
      root,
      component() {
        value = state(1);
        return <output>{value()}</output>;
      },
    });
    value.set(2);
    getDefaultRuntime().scheduler.flush();
    expect(root.textContent).toBe('2');

    // The reader's owner is one stable, mounted owner view.
    expect(owners.size).toBe(1);
    const [owner] = owners;
    expect(owner.mounted).toBe(true);
    expect(owner.target).toBe(root);

    cleanupApp(root);
    expect(owner.mounted).toBe(false);
    value.set(3);
    getDefaultRuntime().scheduler.flush();
    expect(owners.size).toBe(1);
    expect(root.textContent).not.toContain('3');
  } finally {
    spy.mockRestore();
    cleanupApp(root);
  }
});
