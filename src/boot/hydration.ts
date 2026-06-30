import { isProductionEnvironment } from '../common/env';
import { SSR_RENDER_DATA_ATTR, type SSRData } from '../common/ssr';
import type { ComponentFunction } from '../runtime/component';
import { setStaticChildSlotsCacheEnabled } from '../renderer/dom';
import type { BootAppRouteSource, HydrateSPAConfig } from './types';

type MountOrUpdateRoot = (
  rootElement: Element,
  componentFn: ComponentFunction,
  options?: { cleanupStrict?: boolean }
) => void;

export type HydrationRuntimeHooks = {
  mountOrUpdate: MountOrUpdateRoot;
  registerAppNavigation: (
    rootElement: Element,
    path: string,
    source?: BootAppRouteSource
  ) => Promise<void>;
  registerRootCleanupCallback: (
    rootElement: Element,
    callback: () => void
  ) => () => void;
  flushHydrationActivation: (rootElement: Element) => void;
};

export function takeHydrationRenderData(rootElement: Element): SSRData | null {
  for (const child of Array.from(rootElement.children)) {
    if (
      child instanceof HTMLScriptElement &&
      child.getAttribute(SSR_RENDER_DATA_ATTR) === 'true'
    ) {
      const raw = child.textContent ?? '';
      child.remove();
      if (!raw) {
        return {};
      }

      try {
        return JSON.parse(raw) as SSRData;
      } catch (err) {
        throw new Error(
          '[Askr] Failed to parse embedded SSR render data during hydration.',
          { cause: err }
        );
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
  boundaries: Element[],
  foldY: number
): { activated: boolean; remaining: number } {
  let activated = false;
  let remaining = 0;

  for (const element of boundaries) {
    if (!element.hasAttribute('data-skip-hydrate')) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (rect.top < foldY) {
      element.removeAttribute('data-skip-hydrate');
      activated = true;
    } else {
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
  resolved: { handler: ComponentFunction; params: Record<string, unknown> },
  path: string,
  cleanupStrict: boolean | undefined,
  hydrateOptions: NonNullable<HydrateSPAConfig['hydrate']>,
  source: BootAppRouteSource | undefined,
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
        deferredBoundaries,
        foldY
      );

      if (!activated) {
        return;
      }

      hooks.flushHydrationActivation(rootElement);

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
        const { activated } = activateVisibleDeferredBoundaries(
          deferredBoundaries,
          Number.POSITIVE_INFINITY
        );
        if (activated) {
          hooks.flushHydrationActivation(rootElement);
        }
      } finally {
        releaseSelectiveHydrationResources();
      }
    });
  }

  if (deferredBoundaries.length === 0) {
    releaseSelectiveHydrationResources();
  }
}
