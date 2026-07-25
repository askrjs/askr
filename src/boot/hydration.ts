import { isProductionEnvironment } from '../common/env';
import { SSR_RENDER_DATA_ATTR } from '../common/ssr';
import {
  pageRenderEnvelope,
  type PageRenderEnvelope,
} from '../common/page-render-envelope';
import type { ResolvedRoute } from '../common/router';
import type { ComponentFunction } from '../runtime';
import { setStaticChildSlotsCacheEnabled } from '../renderer/dom';
import { registerDeferredHydrationBoundary } from '../renderer';
import type { BootAppRouteSource, HydrateSPAConfig } from './types';
import { reviveDeferredValue } from '../router/deferred';
import type { AppRenderRuntime } from '../common/app-render-runtime';

const DEFERRED_PAYLOAD = '__askr_deferred__';

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
        return pageRenderEnvelope(JSON.parse(raw, hydrationReviver));
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
      registerDeferredHydrationBoundary(root, element);
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
  activate: HydrationRuntimeHooks['activateHydrationBoundary']
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
        }
      } catch {
        // The renderer restores the marker and provisional state on failure;
        // the next reveal event is therefore a safe retry point.
      }
    }

    if (element.hasAttribute('data-skip-hydrate')) {
      remaining += 1;
    }
  }

  return { activated, remaining };
}

function queueIdleWork(work: () => void): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(
        () => {
          work();
          resolve();
        },
        { timeout: 2000 }
      );
      return;
    }

    setTimeout(() => {
      work();
      resolve();
    }, 0);
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
  hooks: HydrationRuntimeHooks
): Promise<void> {
  const hasPermanentSkips = (hydrateOptions.skipSelectors?.length ?? 0) > 0;
  const hasBelowFoldDeferral = !!hydrateOptions.deferBelowFold;
  const hasSelectiveBoundaries = hasPermanentSkips || hasBelowFoldDeferral;
  let staticChildSlotsCacheSuspended = false;
  let releaseSelectiveHydrationResources = () => {};

  const restoreStaticChildSlotsCache = () => {
    if (!staticChildSlotsCacheSuspended) {
      return;
    }

    setStaticChildSlotsCacheEnabled(true);
    staticChildSlotsCacheSuspended = false;
  };

  if (hydrateOptions.skipSelectors?.length) {
    markSkippedElements(rootElement, hydrateOptions.skipSelectors);
  }

  let deferredBoundaries: Element[] = [];
  if (hydrateOptions.deferBelowFold) {
    setStaticChildSlotsCacheEnabled(false);
    staticChildSlotsCacheSuspended = true;
    const foldY = hydrateOptions.foldThreshold ?? window.innerHeight;
    deferredBoundaries = collectDeferredBelowFoldBoundaries(rootElement, foldY);

    let selectiveHydrationResourcesReleased = false;
    let unregisterRootCleanupCallback = () => {};

    function handleScroll() {
      const { activated, remaining } = activateVisibleDeferredBoundaries(
        rootElement,
        deferredBoundaries,
        foldY,
        hooks.activateHydrationBoundary
      );

      if (!activated) {
        return;
      }

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
      restoreStaticChildSlotsCache();
    };

    unregisterRootCleanupCallback = hooks.registerRootCleanupCallback(
      rootElement,
      releaseSelectiveHydrationResources
    );

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  if (hydrateOptions.deferUntilIdle && !hasSelectiveBoundaries) {
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
    await hooks.registerAppNavigation(rootElement, path, source);
  } catch (error) {
    releaseSelectiveHydrationResources();
    throw error;
  }

  if (hydrateOptions.deferUntilIdle && deferredBoundaries.length > 0) {
    await queueIdleWork(() => {
      try {
        activateVisibleDeferredBoundaries(
          rootElement,
          deferredBoundaries,
          Number.POSITIVE_INFINITY,
          hooks.activateHydrationBoundary
        );
      } finally {
        releaseSelectiveHydrationResources();
      }
    });
  }

  if (deferredBoundaries.length === 0) {
    releaseSelectiveHydrationResources();
  }
}
