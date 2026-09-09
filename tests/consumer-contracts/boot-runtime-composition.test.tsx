import { expect, test } from 'vitest';
import { getDefaultRuntime } from '@askrjs/askr';
import { cleanupApp, createIsland } from '@askrjs/askr/boot';

test('should preserve renderer configuration made after importing boot', () => {
  const runtime = getDefaultRuntime();
  const native = runtime.renderer;
  const custom = { ...native };
  const root = document.createElement('main');
  runtime.configureRenderer(custom);

  try {
    createIsland({ root, component: () => <output>custom</output> });
    expect(runtime.renderer).toBe(custom);
    expect(root.textContent).toBe('custom');
  } finally {
    cleanupApp(root);
    runtime.configureRenderer(native);
  }
});
