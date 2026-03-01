/**
 * Selective Hydration Configuration for Askr
 *
 * Provides options for deferring or skipping hydration of certain parts of the page
 * to improve time-to-interactive (TTI).
 *
 * Usage:
 * - Set options before calling hydrateSPA
 * - Add data-skip-hydrate attribute to elements to skip
 * - Use deferUntilIdle to wait for idle time
 * - Use deferBelowFold to defer off-screen content
 */

export interface SelectiveHydrationOptions {
  deferUntilIdle?: boolean;
  deferBelowFold?: boolean;
  foldThreshold?: number;
  skipSelectors?: string[];
}

const hydrationOptions: SelectiveHydrationOptions = {};

export function setSelectiveHydrationOptions(
  opts: SelectiveHydrationOptions
): void {
  Object.assign(hydrationOptions, opts);
}

export function getSelectiveHydrationOptions(): Readonly<SelectiveHydrationOptions> {
  return { ...hydrationOptions };
}

export function resetSelectiveHydrationOptions(): void {
  Object.keys(hydrationOptions).forEach((key) => {
    delete (hydrationOptions as Record<string, unknown>)[key];
  });
}

export function shouldSkipHydrationOnElement(element: Element): boolean {
  if (element.hasAttribute('data-skip-hydrate')) {
    return true;
  }

  const skipSelectors = hydrationOptions.skipSelectors;
  if (skipSelectors) {
    for (const selector of skipSelectors) {
      if (element.matches(selector)) {
        return true;
      }
    }
  }

  return false;
}

export function isElementAboveFold(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const foldY =
    hydrationOptions.foldThreshold ??
    (typeof window !== 'undefined' ? window.innerHeight : 0);
  return rect.top < foldY;
}

export function getHydrationOptions(): SelectiveHydrationOptions {
  return hydrationOptions;
}
