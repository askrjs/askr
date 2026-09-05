import { expect, test } from 'vitest';
import { getDefaultRuntime } from '@askrjs/askr';
test('should expose the replacement host installed by native boot', async () => {
  const runtime = getDefaultRuntime();
  const original = runtime.renderer;
  const custom = { ...original };
  const root = document.createElement('main');
  runtime.configureRenderer(custom);
  expect(runtime.renderer).toBe(custom);
  const { cleanupApp, createIsland } = await import('@askrjs/askr/boot');
  try {
    createIsland({ root, component: () => <output>native</output> });
    const installed = runtime.renderer;
    expect(installed).not.toBe(custom);
    expect(runtime.renderer).toBe(installed);
    expect(root.textContent).toBe('native');
    const target = document.createElement('section');
    installed.evaluate(<span>extension</span>, target);
    expect(target.textContent).toBe('extension');
  } finally {
    cleanupApp(root);
    runtime.configureRenderer(original);
  }
});
