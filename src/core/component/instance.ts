/**
 * Component instances and positional hooks.
 *
 * A component instance is an Owner that persists across renders. Its render
 * is a computation: the component function runs with a hook cursor reset to
 * zero, reads are tracked, and a change to anything it read schedules the
 * instance in the render lane. Hooks claim slots by call order; a later render
 * must claim the same kinds in the same order.
 */

import type {
  ComponentContext,
  ComponentFunction,
} from '../../common/component';
import type { Props } from '../../common/props';
import { Owner, getOwner, runWithOwner, type Cleanup } from '../reactive/owner';
import { Computation } from '../reactive/graph';
import { schedule, type Job } from '../reactive/scheduler';
import { withRendering } from './render-state';

export type HookKind = string;

export interface RenderHost {
  /** Re-render a component instance on its own (scheduled update). */
  rerender(instance: ComponentInstance): void;
}

let renderHost: RenderHost | null = null;

export function setRenderHost(host: RenderHost): void {
  renderHost = host;
}

export class ComponentInstance extends Owner {
  fn: ComponentFunction;
  props: Props;
  readonly depth: number;
  hooks: unknown[] = [];
  hookKinds: HookKind[] = [];
  hookIndex = 0;
  /** Set once the first render has committed. */
  mounted = false;
  renderCount = 0;
  readonly computation: Computation<unknown>;
  /** Callbacks to run after this instance's next commit. */
  commitQueue: Array<() => void | Cleanup> | null = null;
  private abortController: AbortController | null = null;
  /** Renderer-owned view of this instance's committed output. */
  view: unknown = null;
  /** Error boundary handler, when this instance is a boundary. */
  boundary: ((error: unknown) => boolean) | null = null;

  constructor(parent: Owner | null, fn: ComponentFunction, props: Props) {
    super(parent);
    this.fn = fn;
    this.props = props;
    this.depth = depthOf(parent) + 1;
    this.computation = new Computation<unknown>(
      this,
      () => this.invoke(),
      renderLaneScheduler(this),
      null
    );
  }

  get signal(): AbortSignal {
    return (this.abortController ??= new AbortController()).signal;
  }

  /** Run the component function. Called only through `computation`. */
  private invoke(): unknown {
    const previous = enterInstance(this);
    this.hookIndex = 0;
    try {
      const context: ComponentContext = { signal: this.signal };
      const output = withRendering(() =>
        runWithOwner(this, () => this.fn(this.props, context))
      );
      verifyHookCount(this);
      this.renderCount++;
      return output;
    } finally {
      enterInstance(previous);
    }
  }

  /** Render now with the current props, tracking reads. Throws on failure. */
  render(): unknown {
    this.computation.run();
    if (this.computation._hasError) throw this.computation._error;
    return this.computation._value;
  }

  onCommit(fn: () => void | Cleanup): void {
    (this.commitQueue ??= []).push(fn);
  }

  protected override onDispose(): void {
    this.abortController?.abort();
  }
}

function depthOf(owner: Owner | null): number {
  for (let o = owner; o; o = o.parent) {
    if (o instanceof ComponentInstance) return o.depth;
    const depth = (o as { depth?: number }).depth;
    if (typeof depth === 'number') return depth;
  }
  return 0;
}

function renderLaneScheduler(instance: ComponentInstance) {
  let job: Job | null = null;
  return () => {
    job ??= {
      depth: instance.depth,
      run: () => renderHost?.rerender(instance),
      get skip() {
        return instance.disposed || !instance.computation.stale;
      },
    };
    schedule(job, 'render');
  };
}

let currentInstance: ComponentInstance | null = null;

function enterInstance(
  instance: ComponentInstance | null
): ComponentInstance | null {
  const previous = currentInstance;
  currentInstance = instance;
  return previous;
}

export function getCurrentInstance(): ComponentInstance | null {
  return currentInstance;
}

export function requireInstance(api: string): ComponentInstance {
  const instance = currentInstance;
  if (!instance) {
    throw new Error(
      `${api} can only be called during component render execution. ` +
        `Move ${api} calls to the top level of your component function.`
    );
  }
  return instance;
}

/**
 * Claim the next hook slot. Returns the slot index; the caller stores its
 * value in `instance.hooks[index]`.
 */
export function claimHook(instance: ComponentInstance, kind: HookKind): number {
  const index = instance.hookIndex++;
  const expected = instance.hookKinds[index];
  if (expected === undefined) {
    if (instance.renderCount > 0) {
      throw hookOrderError(instance, index, kind, undefined);
    }
    instance.hookKinds[index] = kind;
  } else if (expected !== kind) {
    throw hookOrderError(instance, index, kind, expected);
  }
  return index;
}

function verifyHookCount(instance: ComponentInstance): void {
  if (
    instance.renderCount > 0 &&
    instance.hookIndex !== instance.hookKinds.length
  ) {
    throw hookOrderError(
      instance,
      instance.hookIndex,
      undefined,
      instance.hookKinds[instance.hookIndex]
    );
  }
}

function hookOrderError(
  instance: ComponentInstance,
  index: number,
  actual: HookKind | undefined,
  expected: HookKind | undefined
): Error {
  const name = instance.fn.name || 'anonymous component';
  return new Error(
    `[Askr] Hook order changed in ${name}: slot ${index} was ` +
      `${expected ? `${expected}()` : 'not claimed'} on the first render but ` +
      `${actual ? `${actual}()` : 'not claimed'} now. ` +
      `Call state(), derive() and other lifecycle APIs unconditionally at the ` +
      `top level of the component, in the same order on every render.`
  );
}

/** The nearest component instance owning the current execution. */
export function getLifecycleInstance(): ComponentInstance | null {
  if (currentInstance) return currentInstance;
  for (let owner = getOwner(); owner; owner = owner.parent) {
    if (owner instanceof ComponentInstance) return owner;
  }
  return null;
}

/** Schedule a standalone re-render of `instance`. */
export function invalidateInstance(instance: ComponentInstance): void {
  instance.computation.invalidate();
}

export function getRenderHost(): RenderHost | null {
  return renderHost;
}
