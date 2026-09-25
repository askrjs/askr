import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

type SSRContextModule = typeof import('../../../src/ssr/context');

const globalRecord = globalThis as unknown as Record<string, unknown>;

/**
 * Run `work` with `globalThis.process` replaced (or removed when `process` is
 * `undefined`) and `globalThis.AsyncLocalStorage` set to `asyncLocalStorage`,
 * restoring both afterwards.
 */
async function withRuntimeGlobals<T>(
  globals: {
    process: unknown;
    asyncLocalStorage?: unknown;
  },
  work: () => Promise<T>
): Promise<T> {
  const originalProcess = globalRecord.process;
  const hadAsyncLocalStorage = 'AsyncLocalStorage' in globalRecord;
  const originalAsyncLocalStorage = globalRecord.AsyncLocalStorage;
  try {
    if (globals.process === undefined) delete globalRecord.process;
    else globalRecord.process = globals.process;
    if (globals.asyncLocalStorage !== undefined) {
      globalRecord.AsyncLocalStorage = globals.asyncLocalStorage;
    }
    return await work();
  } finally {
    globalRecord.process = originalProcess;
    if (hadAsyncLocalStorage) {
      globalRecord.AsyncLocalStorage = originalAsyncLocalStorage;
    } else {
      delete globalRecord.AsyncLocalStorage;
    }
  }
}

/** A `process` that looks like Deno or Bun: Node builtins, no `versions.node`. */
function nodeCompatibleProcess(): unknown {
  return new Proxy(process, {
    get(target, prop, receiver) {
      if (prop === 'versions') return {};
      return Reflect.get(target, prop, receiver);
    },
  });
}

async function importContextModule(): Promise<SSRContextModule> {
  vi.resetModules();
  return import('../../../src/ssr/context');
}

/** Two overlapping async renders must each observe only their own context. */
async function expectIsolatedAsyncRenders(
  mod: SSRContextModule
): Promise<void> {
  const first = mod.createRenderContext(1, { url: '/first' });
  const second = mod.createRenderContext(2, { url: '/second' });
  // Both renders suspend on the same gate, so their continuations interleave.
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const observe = async () => {
    const before = mod.getRenderContext()?.url;
    await gate;
    return [before, mod.getRenderContext()?.url];
  };

  const renders = Promise.all([
    mod.withRenderContextAsync(first, observe),
    mod.withRenderContextAsync(second, observe),
  ]);
  open();
  await expect(renders).resolves.toEqual([
    ['/first', '/first'],
    ['/second', '/second'],
  ]);
  expect(mod.getRenderContext()).toBeNull();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('SSR async render context runtimes', () => {
  it('should use globalThis.AsyncLocalStorage on runtimes without a Node process', async () => {
    const mod = await importContextModule();
    await withRuntimeGlobals(
      { process: undefined, asyncLocalStorage: AsyncLocalStorage },
      () => expectIsolatedAsyncRenders(mod)
    );
  });

  it('should load node:async_hooks on Node-compatible runtimes without process.versions.node', async () => {
    const mod = await importContextModule();
    await withRuntimeGlobals({ process: nodeCompatibleProcess() }, () =>
      expectIsolatedAsyncRenders(mod)
    );
  });

  it('should install AsyncLocalStorage for synchronous entry without evaluating code', async () => {
    const mod = await importContextModule();
    // Strict CSP without 'unsafe-eval' makes the Function constructor throw.
    vi.stubGlobal(
      'Function',
      new Proxy(Function, {
        construct() {
          throw new EvalError('Refused to evaluate a string as JavaScript');
        },
      })
    );
    const ctx = mod.createRenderContext(1, { url: '/sync-entry' });

    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const pending = mod.withRenderContext(ctx, async () => {
      await gate;
      return mod.getRenderContext()?.url;
    });
    open();

    await expect(pending).resolves.toBe('/sync-entry');
  });
});
