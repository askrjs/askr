import { isProductionEnvironment } from '../common/env';
import { SSR_RENDER_DATA_ATTR } from '../common/ssr';
import {
  pageRenderEnvelope,
  isPageRenderEnvelope,
  type PageRenderEnvelope,
} from '../common/page-render-envelope';
import type { ResolvedRoute } from '../common/router';
import type { ComponentFunction } from '../common/component';
import type { BootAppRouteSource, HydrateSPAConfig } from './types';
import { reviveDeferredValue } from '../common/deferred-value';
import { reportUncaughtErrorLater } from '../common/report-error';
import {
  RenderDepthError,
  clarifyRenderOverflow,
} from '../common/render-depth';
import type { AppRenderRuntime } from '../common/app-render-runtime';
import type { HydrationInteractionReplay } from './hydration-interaction-replay';

const DEFERRED_PAYLOAD = '__askr_deferred__';
const SSR_STYLE_REGISTRY_ATTR = 'data-askr-style-registry';

export function applyDeferredStreamPatches(rootElement: Element): void {
  const patches = Array.from(
    rootElement.querySelectorAll<HTMLTemplateElement>(
      'template[data-askr-deferred-patch]'
    )
  );
  for (const template of patches) {
    const id = template.getAttribute('data-askr-deferred-patch');
    if (!id) continue;
    const boundary = Array.from(
      rootElement.querySelectorAll<HTMLElement>(
        'askr-resolve[data-askr-deferred]'
      )
    ).find((candidate) => candidate.getAttribute('data-askr-deferred') === id);
    if (boundary) boundary.replaceWith(template.content.cloneNode(true));
    template.remove();
    for (const script of Array.from(
      rootElement.querySelectorAll<HTMLScriptElement>(
        'script[data-askr-deferred-apply]'
      )
    )) {
      if (script.getAttribute('data-askr-deferred-apply') === id)
        script.remove();
    }
  }
}

function hydrationReviver(_key: string, value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const payload = value as {
    [DEFERRED_PAYLOAD]?: string;
    value?: unknown;
    error?: unknown;
  };
  if (payload[DEFERRED_PAYLOAD] === 'fulfilled') {
    return reviveDeferredValue('fulfilled', payload.value, undefined);
  }
  if (payload[DEFERRED_PAYLOAD] === 'rejected') {
    return reviveDeferredValue('rejected', undefined, payload.error);
  }
  return value;
}

function parseHydrationRenderData(raw: string): unknown {
  const value: unknown = JSON.parse(raw);
  if (
    !isPageRenderEnvelope(value) ||
    !Object.prototype.hasOwnProperty.call(value, 'deferredPaths')
  ) {
    // Existing published pages do not carry location metadata.
    return JSON.parse(raw, hydrationReviver);
  }
  const payload = value as PageRenderEnvelope & { deferredPaths: unknown };
  const paths = payload.deferredPaths;
  if (
    !Array.isArray(paths) ||
    paths.some(
      (path: unknown) =>
        !Array.isArray(path) ||
        path.some((key: unknown) => typeof key !== 'string')
    )
  ) {
    throw new TypeError('Invalid deferred hydration locations.');
  }
  // Children are serialized after their parents, so revive deepest values
  // first, before a parent is wrapped in its immutable Deferred value.
  for (let index = paths.length - 1; index >= 0; index--) {
    const path = paths[index] as string[];
    let parent: unknown = value;
    for (const key of path.slice(0, -1)) {
      if (
        !parent ||
        typeof parent !== 'object' ||
        !Object.prototype.hasOwnProperty.call(parent, key)
      ) {
        throw new TypeError('Missing deferred hydration location.');
      }
      parent = (parent as Record<string, unknown>)[key];
    }
    const key = path[path.length - 1];
    if (
      path.length === 0 ||
      !parent ||
      typeof parent !== 'object' ||
      !Object.prototype.hasOwnProperty.call(parent, key)
    ) {
      throw new TypeError('Missing deferred hydration location.');
    }
    const record = parent as Record<string, unknown>;
    record[key] = hydrationReviver(key, record[key]);
  }
  delete (payload as Partial<typeof payload>).deferredPaths;
  return payload;
}

type MountOrUpdateRoot = (
  rootElement: Element,
  componentFn: ComponentFunction,
  options?: { cleanupStrict?: boolean; appRuntime?: AppRenderRuntime }
) => void;

export type HydrationRuntimeHooks = {
  mountOrUpdate: MountOrUpdateRoot;
  registerAppNavigation: (
    rootElement: Element,
    path: string,
    source: BootAppRouteSource
  ) => Promise<void>;
  registerRootCleanupCallback: (
    rootElement: Element,
    callback: () => void
  ) => () => void;
  activateHydrationBoundary: (
    rootElement: Element,
    boundary: Element
  ) => boolean;
};

/**
 * Relocate the SSR style registry carrier out of the hydration root.
 *
 * `@askrjs/server` prepends the collected styles to the page body, so they land
 * as a direct child of the mount root. That extra element makes the root's
 * child list disagree with the rendered tree, which costs the app in-place
 * adoption and discards the carried CSS during reconciliation. The carrier is
 * transport rather than application markup, so move it into `<head>`, where it
 * still applies and no longer participates in reconciliation.
 *
 * Deferred style patches resolve the carrier with a document-wide query, so
 * they keep working from its new position.
 */
export function adoptSsrStyleCarriers(rootElement: Element): void {
  const head = document.head;
  if (!head) return;
  for (const child of Array.from(rootElement.children)) {
    if (
      child instanceof HTMLStyleElement &&
      child.hasAttribute(SSR_STYLE_REGISTRY_ATTR)
    ) {
      head.append(child);
    }
  }
}

export function takeHydrationRenderData(
  rootElement: Element
): PageRenderEnvelope | null {
  for (const child of Array.from(rootElement.children)) {
    if (
      child instanceof HTMLScriptElement &&
      child.getAttribute(SSR_RENDER_DATA_ATTR) === 'true'
    ) {
      const raw = child.textContent ?? '';
      child.remove();
      if (!raw) {
        return pageRenderEnvelope(undefined);
      }

      try {
        return pageRenderEnvelope(parseHydrationRenderData(raw));
      } catch (err) {
        const error = new Error(
          '[Askr] Failed to parse embedded SSR render data during hydration.'
        );
        (error as Error & { cause?: unknown }).cause = err;
        throw error;
      }
    }
  }

  return null;
}

export function markSkippedElements(
  root: Element,
  skipSelectors: string[]
): void {
  if (skipSelectors.length === 0) {
    return;
  }

  const uniqueSelectors = Array.from(new Set(skipSelectors));
  const selectorList = uniqueSelectors.join(', ');
  const elements = root.querySelectorAll(selectorList);
  elements.forEach((el) => el.setAttribute('data-skip-hydrate', 'true'));
}

function collectDeferredBelowFoldBoundaries(
  root: Element,
  foldY: number
): Element[] {
  const boundaries: Element[] = [];
  const stack: Element[] = [];

  for (let index = root.children.length - 1; index >= 0; index -= 1) {
    stack.push(root.children[index]);
  }

  while (stack.length > 0) {
    const element = stack.pop()!;

    if (element.hasAttribute('data-skip-hydrate')) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (rect.top >= foldY) {
      element.setAttribute('data-skip-hydrate', 'true');
      boundaries.push(element);
      continue;
    }

    for (let index = element.children.length - 1; index >= 0; index -= 1) {
      stack.push(element.children[index]);
    }
  }

  return boundaries;
}

function activateVisibleDeferredBoundaries(
  root: Element,
  boundaries: Element[],
  foldY: number,
  activate: HydrationRuntimeHooks['activateHydrationBoundary'],
  reportedDepthErrors: WeakSet<Element>
): { activated: boolean; remaining: number } {
  let activated = false;
  let remaining = 0;

  for (const element of boundaries) {
    if (!element.hasAttribute('data-skip-hydrate')) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (rect.top < foldY) {
      try {
        if (activate(root, element)) {
          activated = true;
          reportedDepthErrors.delete(element);
        }
      } catch (error) {
        // The renderer restores the marker and provisional state on failure;
        // the next reveal event is therefore a safe retry point.
        const clarified = clarifyRenderOverflow(error);
        if (
          clarified instanceof RenderDepthError &&
          !reportedDepthErrors.has(element)
        ) {
          reportedDepthErrors.add(element);
          reportUncaughtErrorLater(clarified);
        }
      }
    }

    if (element.hasAttribute('data-skip-hydrate')) {
      remaining += 1;
    }
  }

  return { activated, remaining };
}

function queueIdleWork(work: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const run = () => {
      try {
        work();
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(run, { timeout: 2000 });
      return;
    }

    setTimeout(run, 0);
  });
}

export function shouldVerifyHydrationMarkup(config: HydrateSPAConfig): boolean {
  const explicit = config.hydrate?.verifyMarkup;
  if (typeof explicit === 'boolean') {
    return explicit;
  }

  return !isProductionEnvironment();
}

export async function applySelectiveHydration(
  rootElement: Element,
  resolved: ResolvedRoute,
  path: string,
  cleanupStrict: boolean | undefined,
  hydrateOptions: NonNullable<HydrateSPAConfig['hydrate']>,
  source: BootAppRouteSource,
  hooks: HydrationRuntimeHooks,
  interactionReplay: HydrationInteractionReplay
): Promise<void> {
  const hasBelowFoldDeferral = !!hydrateOptions.deferBelowFold;
  let releaseSelectiveHydrationResources = () => {};
  let registerSelectiveHydrationCleanup = () => {};

  if (hydrateOptions.skipSelectors?.length) {
    markSkippedElements(rootElement, hydrateOptions.skipSelectors);
  }

  let deferredBoundaries: Element[] = [];
  const reportedDepthErrors = new WeakSet<Element>();
  if (hydrateOptions.deferBelowFold) {
    const foldY = hydrateOptions.foldThreshold ?? window.innerHeight;
    deferredBoundaries = collectDeferredBelowFoldBoundaries(rootElement, foldY);
    interactionReplay.registerDeferredBoundaries(deferredBoundaries);

    let selectiveHydrationResourcesReleased = false;
    let unregisterRootCleanupCallback = () => {};

    function handleScroll() {
      const { remaining } = activateVisibleDeferredBoundaries(
        rootElement,
        deferredBoundaries,
        foldY,
        hooks.activateHydrationBoundary,
        reportedDepthErrors
      );

      if (remaining === 0) {
        releaseSelectiveHydrationResources();
      }
    }

    releaseSelectiveHydrationResources = () => {
      if (selectiveHydrationResourcesReleased) {
        return;
      }

      selectiveHydrationResourcesReleased = true;
      unregisterRootCleanupCallback();
      window.removeEventListener('scroll', handleScroll);
      interactionReplay.clearDeferredBoundaries();
    };

    interactionReplay.setOnDeferredBoundariesDrained(
      releaseSelectiveHydrationResources
    );

    registerSelectiveHydrationCleanup = () => {
      unregisterRootCleanupCallback = hooks.registerRootCleanupCallback(
        rootElement,
        releaseSelectiveHydrationResources
      );
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  if (hydrateOptions.deferUntilIdle && !hasBelowFoldDeferral) {
    await queueIdleWork(() => {
      hooks.mountOrUpdate(
        rootElement,
        (() => resolved.handler(resolved.params)) as ComponentFunction,
        {
          cleanupStrict,
          appRuntime: source?.runtime,
        }
      );
    });
    await hooks.registerAppNavigation(rootElement, path, source);
    return;
  }

  try {
    hooks.mountOrUpdate(
      rootElement,
      (() => resolved.handler(resolved.params)) as ComponentFunction,
      {
        cleanupStrict,
        appRuntime: source?.runtime,
      }
    );
    registerSelectiveHydrationCleanup();
    await hooks.registerAppNavigation(rootElement, path, source);
  } catch (error) {
    releaseSelectiveHydrationResources();
    throw error;
  }

  if (hydrateOptions.deferUntilIdle && deferredBoundaries.length > 0) {
    await queueIdleWork(() => {
      try {
        const { remaining } = activateVisibleDeferredBoundaries(
          rootElement,
          deferredBoundaries,
          Number.POSITIVE_INFINITY,
          hooks.activateHydrationBoundary,
          reportedDepthErrors
        );
        if (remaining === 0) releaseSelectiveHydrationResources();
      } catch (error) {
        releaseSelectiveHydrationResources();
        throw error;
      }
    });
  }

  if (deferredBoundaries.length === 0) {
    releaseSelectiveHydrationResources();
  }
}
