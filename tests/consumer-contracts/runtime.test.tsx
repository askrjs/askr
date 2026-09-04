import { expect, test, vi } from 'vitest';
import { ErrorBoundary } from '@askrjs/askr/components';
import {
  AskrRuntime,
  createRuntime,
  derive,
  getDefaultRuntime,
  state,
  type RuntimeRendererHost,
  type State,
} from '@askrjs/askr';
import { watch } from '@askrjs/askr/resources';
import { render, type RenderResult } from '@askrjs/askr/testing';

test('should preserve synchronous execution and committed watch generations', () => {
  const events: string[] = [];
  let count!: State<number>;
  const view = render(() => {
    events.push('render');
    count = state(0);
    const doubled = derive(() => count() * 2);
    watch(doubled, (value, { signal, previous, initial }) => {
      events.push(`watch:${value}:${previous}:${initial}`);
      signal.addEventListener('abort', () => events.push('abort'));
      return () => {
        events.push('cleanup');
      };
    });
    return <output>{() => doubled()}</output>;
  });
  try {
    expect(view.root.textContent).toBe('0');
    expect(events).toEqual(['render', 'watch:0:undefined:true']);
    count.set(1);
    count.set(2);
    view.flush();
    expect(view.root.textContent).toBe('4');
    expect(events).toEqual([
      'render',
      'watch:0:undefined:true',
      'abort',
      'cleanup',
      'watch:4:0:false',
    ]);
    view.unmount();
    view.unmount();
    expect(events.slice(-2)).toEqual(['abort', 'cleanup']);
    expect(events.filter((event) => event === 'cleanup')).toHaveLength(2);
    count.set(3);
    view.flush();
    expect(events.filter((event) => event.startsWith('watch:'))).toHaveLength(
      2
    );
  } finally {
    view.cleanup();
  }
});

test('should preserve runtime configuration, replacement and scheduler callbacks', () => {
  const original = getDefaultRuntime().renderer;
  const calls: unknown[][] = [];
  const renderer: RuntimeRendererHost = {
    ...original,
    evaluate(node, target, context, owner) {
      expect(this).toBe(renderer);
      calls.push([node, target, context, owner]);
      original.evaluate(node, target, context, owner);
    },
  };
  const scheduler = getDefaultRuntime().scheduler;
  const runtime = createRuntime({ scheduler, renderer });
  expect(runtime).toBeInstanceOf(AskrRuntime);
  expect(runtime.scheduler).toBe(scheduler);
  expect(runtime.renderer).toBe(renderer);
  const root = document.createElement('main');
  const context = {};
  runtime.renderer.evaluate(<span>custom host</span>, root, context);
  expect(calls).toEqual([[expect.any(Object), root, context, undefined]]);
  expect(root.textContent).toBe('custom host');
  runtime.configureRenderer(original);
  expect(runtime.renderer).toBe(original);
  expect(getDefaultRuntime().renderer).toBe(original);

  const events: string[] = [];
  runtime.scheduler.runInHandlerScope(() => {
    runtime.scheduler.enqueueInLane('post', () => events.push('post'));
    runtime.scheduler.enqueueInLane('reactive', () => events.push('reactive'));
    runtime.scheduler.enqueue(() => events.push('component'));
    runtime.scheduler.enqueueInLane('derived', () => events.push('derived'));
    expect(events).toEqual([]);
  }, 'sync');
  expect(events).toEqual(['derived', 'component', 'reactive', 'post']);
  original.teardownNodeSubtree(root);
});

test('should expose stable callback owners backed by the committed state readers', () => {
  const runtime = getDefaultRuntime();
  const original = runtime.renderer;
  let owner: Parameters<RuntimeRendererHost['evaluate']>[3];
  let count!: State<number>;
  let evaluations = 0;
  let view: RenderResult | undefined;
  const custom: RuntimeRendererHost = {
    ...original,
    evaluate(node, target, context, retainedOwner) {
      expect(this).toBe(custom);
      if (retainedOwner) {
        if (owner) expect(retainedOwner).toBe(owner);
        owner = retainedOwner;
        expect(owner.target).toBe(target);
        evaluations++;
      }
      original.evaluate(node, target, context, retainedOwner);
    },
  };
  runtime.configureRenderer(custom);
  try {
    view = render(() => {
      count = state(0);
      return <output>{String(count())}</output>;
    });
    expect(owner).toBeDefined();
    const generation = owner!._ownershipGeneration;
    expect(count._readers?.get(owner!)?.generation).toBe(generation);
    count.set(1);
    view.flush();
    expect(view.root.textContent).toBe('1');
    expect(evaluations).toBeGreaterThanOrEqual(2);
    expect(owner!._ownershipGeneration).toBe(generation);
    expect(count._readers?.get(owner!)?.generation).toBe(generation);
    view.unmount();
    expect(owner!.notifyUpdate).toBeNull();
    expect(count._readers?.has(owner!)).not.toBe(true);
  } finally {
    try {
      view?.cleanup();
    } finally {
      runtime.configureRenderer(original);
    }
  }
});

test('should drain sibling cleanup before surfacing a strict disposal failure', () => {
  const events: string[] = [];
  const view = render(
    () => {
      const value = state(0);
      watch(value, () => () => {
        events.push('first');
        throw new Error('first cleanup failed');
      });
      watch(value, () => () => {
        events.push('second');
      });
      return <output>{value()}</output>;
    },
    { cleanupStrict: true }
  );
  try {
    expect(() => view.unmount()).toThrow(AggregateError);
    expect(events).toEqual(['first', 'second']);
    view.unmount();
    expect(events).toEqual(['first', 'second']);
  } finally {
    view.cleanup();
  }
});

test('should report a render failure before displaying its boundary fallback', () => {
  const errors: unknown[] = [];
  const failure = new Error('consumer render failed');
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  const Broken = () => {
    throw failure;
  };
  const view = render(() => (
    <ErrorBoundary
      onError={(error) => {
        errors.push(error);
      }}
      fallback={(error) => {
        expect(errors).toEqual([failure]);
        expect(error).toBe(failure);
        return <p>recovered</p>;
      }}
    >
      <Broken />
    </ErrorBoundary>
  ));
  try {
    expect(view.root.textContent).toBe('recovered');
  } finally {
    view.cleanup();
    logged.mockRestore();
  }
});
