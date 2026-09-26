import { getSignal, state, type State } from '@askrjs/askr';
import { cleanupApp, createIsland, hydrateSPA } from '@askrjs/askr/boot';
import { createRouteRegistry, route } from '@askrjs/askr/router';
import { renderToString } from '@askrjs/askr/ssr';
import { flushScheduler } from '../render/test-renderer';

/**
 * Nesting depths the runtime guarantees, as documented in
 * docs/concepts/runtime-enforcement.md. Keep the two in sync.
 */
export const supportedNestingDepth = {
  /** Wrapper chains: client mount, reconciliation, and teardown. */
  wrapperChain: 10_000,
  /** Wrapper chains: server rendering and hydration. */
  wrapperChainServer: 1_000,
  /** Nesting through host elements, with or without components between. */
  elementNesting: 100,
} as const;

/**
 * - `wrapper-chain`: each component returns the next component directly.
 * - `element-interleaved`: each component returns `<div><Next /></div>`.
 * - `element-only`: one component returns `depth` nested `<div>` elements.
 *
 * Every shape ends in a stateful leaf component that renders `label:count`.
 */
export type DeepNestingShape =
  | 'wrapper-chain'
  | 'element-interleaved'
  | 'element-only';

type NestingProps = { depth: number; label: string };

interface DeepNestingProbe {
  label: State<string>;
  count: State<number>;
  signal: AbortSignal;
}

function createDeepNestingApp(shape: DeepNestingShape, depth: number) {
  const probe = {} as DeepNestingProbe;

  function Leaf({ label }: { label: string }) {
    const count = state(0);
    probe.count = count;
    probe.signal = getSignal();
    return (
      <button data-depth-leaf="true">
        {label}:{count()}
      </button>
    );
  }

  function WrapperChain({ depth, label }: NestingProps): unknown {
    return depth === 0 ? (
      <Leaf label={label} />
    ) : (
      <WrapperChain depth={depth - 1} label={label} />
    );
  }

  function ElementInterleaved({ depth, label }: NestingProps): unknown {
    return depth === 0 ? (
      <Leaf label={label} />
    ) : (
      <div>
        <ElementInterleaved depth={depth - 1} label={label} />
      </div>
    );
  }

  function ElementOnly({ depth, label }: NestingProps): unknown {
    let node: unknown = <Leaf label={label} />;
    for (let level = 0; level < depth; level += 1) {
      node = <div>{node}</div>;
    }
    return node;
  }

  const Shape =
    shape === 'wrapper-chain'
      ? WrapperChain
      : shape === 'element-interleaved'
        ? ElementInterleaved
        : ElementOnly;

  function App() {
    const label = state('before');
    probe.label = label;
    return <Shape depth={depth} label={label()} />;
  }

  return { App, probe };
}

function readLeaf(root: Element): Element | null {
  return root.querySelector('[data-depth-leaf="true"]');
}

export interface DeepNestingClientResult {
  mounted: string | null | undefined;
  leafUpdated: string | null | undefined;
  rootUpdated: string | null | undefined;
  leafAbortedOnTeardown: boolean;
}

/**
 * Mount through `createIsland`, update the deepest component, update the root
 * so reconciliation walks the full depth, then tear the island down.
 */
export function runDeepNestingClientLifecycle(
  root: Element,
  shape: DeepNestingShape,
  depth: number
): DeepNestingClientResult {
  const { App, probe } = createDeepNestingApp(shape, depth);

  createIsland({ root, component: App });
  const mounted = readLeaf(root)?.textContent;

  probe.count.set(5);
  flushScheduler();
  const leafUpdated = readLeaf(root)?.textContent;

  // The root update must walk every level to reach the leaf, and the leaf
  // keeps its count only if that walk retains it rather than recreating it.
  probe.label.set('after');
  flushScheduler();
  const rootUpdated = readLeaf(root)?.textContent;

  const leafSignal = probe.signal;
  cleanupApp(root);

  return {
    mounted,
    leafUpdated,
    rootUpdated,
    leafAbortedOnTeardown: leafSignal.aborted,
  };
}

export interface DeepNestingServerResult {
  html: string;
  hydratedInPlace: boolean;
  updatedAfterHydration: string | null | undefined;
  leafAbortedOnTeardown: boolean;
}

const deepNestingPath = '/deep-nesting';

/**
 * Server-render the tree through the route renderer, hydrate that markup,
 * update the root, then tear the application down.
 */
export async function runDeepNestingServerLifecycle(
  root: HTMLElement,
  shape: DeepNestingShape,
  depth: number
): Promise<DeepNestingServerResult> {
  const { App, probe } = createDeepNestingApp(shape, depth);
  const registry = createRouteRegistry(() => {
    route(deepNestingPath, () => <App />);
  });

  if (window.location.pathname !== deepNestingPath) {
    window.history.replaceState({}, '', deepNestingPath);
  }

  const html = renderToString({ url: deepNestingPath, registry });
  root.innerHTML = html;
  const serverLeaf = readLeaf(root);

  await hydrateSPA({ root, registry });
  const hydratedInPlace = serverLeaf !== null && readLeaf(root) === serverLeaf;

  probe.label.set('after');
  flushScheduler();
  const updatedAfterHydration = readLeaf(root)?.textContent;

  const leafSignal = probe.signal;
  cleanupApp(root);

  return {
    html,
    hydratedInPlace,
    updatedAfterHydration,
    leafAbortedOnTeardown: leafSignal.aborted,
  };
}
