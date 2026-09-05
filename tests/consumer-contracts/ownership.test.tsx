import { expect, test } from 'vitest';
import {
  getDefaultRuntime,
  state,
  type RuntimeRendererHost,
} from '@askrjs/askr';
import { render } from '@askrjs/askr/testing';

type Owner = NonNullable<Parameters<RuntimeRendererHost['evaluate']>[3]>;

test('should keep extension cleanup properties backed by the callback owner lifetime', () => {
  const runtime = getDefaultRuntime();
  const original = runtime.renderer;
  const cleaned: string[] = [];
  let owner: Owner | undefined;
  runtime.configureRenderer({
    ...original,
    evaluate(...args) {
      if (args[3] && !owner) {
        owner = args[3];
        (owner.cleanupFns ??= []).push(() => cleaned.push('extension'));
        expect(Object.hasOwn(owner, 'mounted')).toBe(true);
      }
      original.evaluate(...args);
    },
  });
  let view: ReturnType<typeof render> | undefined;
  try {
    view = render(() => {
      const value = state(1);
      return <output>{value()}</output>;
    });
    expect(owner?.mounted).toBe(true);
    view.unmount();
    expect(owner?.mounted).toBe(false);
    expect(owner?.cleanupFns).toBeUndefined();
    expect(cleaned).toEqual(['extension']);
  } finally {
    view?.cleanup();
    runtime.configureRenderer(original);
  }
});

test('should accept extension-created owner records through the published host', () => {
  const host = getDefaultRuntime().renderer;
  const root = document.createElement('main');
  const owner: Owner = {
    id: 'extension',
    fn: () => null,
    props: {},
    target: root,
    parentInstance: null,
    portalScope: null,
    mounted: false,
    abortController: null,
    _ownershipGeneration: {},
    evaluationGeneration: 0,
    notifyUpdate: null,
    stateIndexCheck: -1,
    firstRenderComplete: false,
    lifecycleGeneration: 0,
    hasPendingUpdate: false,
    ownerFrame: null,
  };
  host.evaluate(<span>extension</span>, root, undefined, owner);
  expect(root.textContent).toBe('extension');
  expect(owner.id).toBe('extension');
  host.teardownNodeSubtree(root);
});
