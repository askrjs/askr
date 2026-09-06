import { expect, test } from 'vitest';
import {
  getDefaultRuntime,
  For,
  getSignal,
  state,
  type RuntimeRendererHost,
} from '@askrjs/askr';
import { render } from '@askrjs/askr/testing';

type Owner = NonNullable<Parameters<RuntimeRendererHost['evaluate']>[3]>;

test('should drain published owner lifetimes when child-index preparation throws', () => {
  const runtime = getDefaultRuntime();
  const original = runtime.renderer;
  let owner: Owner | undefined;
  let signal!: AbortSignal;
  const cleaned: string[] = [];
  runtime.configureRenderer({
    ...original,
    evaluate(...args) {
      owner ??= args[3];
      original.evaluate(...args);
    },
  });
  let view: ReturnType<typeof render> | undefined;
  try {
    view = render(() => {
      signal = getSignal();
      return (
        <For each={[1]} by={(value) => value}>
          {(value) => <span>{value}</span>}
        </For>
      );
    });
    (owner!.cleanupFns ??= []).push(() => cleaned.push('owner'));
    const scopes = owner!._ownedChildScopes!;
    owner!._ownedChildScopes = new Set([
      ...scopes,
      { key: 'extension', dispose: () => cleaned.push('extension') },
    ]);
    owner!._ownedChildScopes!.has = () => {
      throw new Error('index unavailable');
    };
    view.unmount();
    expect(cleaned).toEqual(['extension', 'owner']);
    expect(signal.aborted).toBe(true);
    expect(owner!.mounted).toBe(false);
    view.unmount();
    expect(cleaned).toHaveLength(2);
  } finally {
    view?.cleanup();
    runtime.configureRenderer(original);
  }
});

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

test('should preserve mutable scoped-child collection identity without exposing ordinary components', () => {
  const runtime = getDefaultRuntime();
  const original = runtime.renderer;
  let owner: Owner | undefined;
  let ordinarySignal!: AbortSignal;
  const cleaned: string[] = [];
  const Ordinary = () => {
    ordinarySignal = getSignal();
    return <span>{'ordinary'}</span>;
  };
  runtime.configureRenderer({
    ...original,
    evaluate(...args) {
      owner ??= args[3];
      original.evaluate(...args);
    },
  });
  let view: ReturnType<typeof render> | undefined;
  try {
    view = render(() => (
      <div>
        <For each={[1]} by={(value) => value}>
          {(value) => <span>{value}</span>}
        </For>
        <Ordinary />
      </div>
    ));
    const native = owner!._ownedChildScopes!;
    expect(native).toBeInstanceOf(Set);
    expect(owner!._ownedChildScopes).toBe(native);
    expect([...native].map((scope) => scope.key)).toEqual(['for-boundary']);
    const removed = { key: 'removed', dispose: () => cleaned.push('removed') };
    const late = { key: 'late', dispose: () => cleaned.push('late') };
    const skipped = { key: 'skipped', dispose: () => cleaned.push('skipped') };
    const retained = {
      key: 'retained',
      dispose: () => {
        cleaned.push('retained');
        assigned.delete(skipped);
        assigned.add(late);
        expect(owner!._ownedChildScopes).toEqual(new Set());
      },
    };
    const assigned = Object.freeze(new Set([...native, removed]));
    owner!._ownedChildScopes = assigned;
    expect(owner!._ownedChildScopes).toBe(assigned);
    assigned.delete(removed);
    assigned.add(retained);
    assigned.add(skipped);
    expect(Object.isFrozen(assigned)).toBe(true);
    view.unmount();
    expect(cleaned).toEqual(['retained', 'late']);
    expect(ordinarySignal.aborted).toBe(true);
    expect(assigned.size).toBe(3);
    expect(owner!._ownedChildScopes).toEqual(new Set());
    expect(owner!._ownedChildScopes).not.toBe(assigned);
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
