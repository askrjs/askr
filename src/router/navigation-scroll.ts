/** Scroll behavior for programmatic navigations (`navigate()`). */
export type NavigationScrollBehavior = 'top' | 'preserve';
/** Scroll behavior for browser back/forward (popstate) navigations. */
export type HistoryScrollBehavior = 'restore' | 'top' | 'preserve';

/** Options for {@link configureScrollRestoration}. */
export type ScrollRestorationOptions = {
  navigation?: NavigationScrollBehavior;
  history?: HistoryScrollBehavior;
};

type NormalizedScrollRestorationOptions = {
  enabled: boolean;
  navigation: NavigationScrollBehavior;
  history: HistoryScrollBehavior;
};

const DEFAULT_SCROLL_RESTORATION: NormalizedScrollRestorationOptions = {
  enabled: true,
  navigation: 'top',
  history: 'restore',
};

let scrollRestorationOptions: NormalizedScrollRestorationOptions = {
  ...DEFAULT_SCROLL_RESTORATION,
};

const scrollPositions = new Map<string, { x: number; y: number }>();
let capturedActivationFocus: FocusDescriptor | undefined;
let pendingNavigationFocus: FocusDescriptor | undefined;
let focusAtHistoryNavigationStart: Element | null = null;

type FocusDescriptor = {
  attribute: 'data-askr-focus-key' | 'id' | 'name' | 'aria-label' | 'label';
  value: string;
};

function readFocusDescriptor(): FocusDescriptor | undefined {
  if (
    typeof document === 'undefined' ||
    !(document.activeElement instanceof HTMLElement)
  ) {
    return undefined;
  }
  const active = document.activeElement;
  for (const attribute of [
    'data-askr-focus-key',
    'id',
    'name',
    'aria-label',
  ] as const) {
    const value = active.getAttribute(attribute);
    if (value) return { attribute, value };
  }
  if ('labels' in active) {
    const label = Array.from((active as HTMLInputElement).labels ?? [])
      .map((element) => element.textContent?.trim())
      .find(Boolean);
    if (label) return { attribute: 'label', value: label };
  }
  return undefined;
}

function clearCapturedNavigationFocus(): void {
  capturedActivationFocus = undefined;
}

function isSameDocumentNavigationTrigger(event: Event): boolean {
  if (
    event instanceof MouseEvent &&
    (event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey)
  ) {
    return false;
  }

  const trigger = event
    .composedPath()
    .find(
      (candidate): candidate is HTMLAnchorElement =>
        candidate instanceof HTMLAnchorElement && candidate.hasAttribute('href')
    );
  if (!trigger || trigger.hasAttribute('download')) {
    return false;
  }
  const target = trigger.getAttribute('target');
  if (target && target.toLowerCase() !== '_self') {
    return false;
  }

  try {
    return (
      new URL(trigger.href, document.baseURI).origin === window.location.origin
    );
  } catch {
    return false;
  }
}

/** Capture entry-owned focus only for the pointer activation that can navigate. */
export function captureNavigationFocus(event: Event): void {
  clearCapturedNavigationFocus();
  if (!isSameDocumentNavigationTrigger(event)) {
    return;
  }

  capturedActivationFocus = readFocusDescriptor();
}

/** Release pointer activation state after its click has finished dispatching. */
export function releaseNavigationFocusCapture(): void {
  clearCapturedNavigationFocus();
}

/** Preserve the active control before route content can be replaced. */
export function prepareNavigationFocus(): void {
  pendingNavigationFocus = capturedActivationFocus ?? readFocusDescriptor();
  clearCapturedNavigationFocus();
}

/** Mark the active element so restoration can avoid overwriting focus moved during route commit. */
export function beginHistoryFocusRestoration(): void {
  focusAtHistoryNavigationStart =
    typeof document === 'undefined' ? null : document.activeElement;
}

function getWindowHref(): string {
  if (typeof window === 'undefined') {
    return '/';
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function normalizeScrollRestorationOptions(
  options?: boolean | ScrollRestorationOptions
): NormalizedScrollRestorationOptions {
  if (options === false) {
    return {
      enabled: false,
      navigation: DEFAULT_SCROLL_RESTORATION.navigation,
      history: DEFAULT_SCROLL_RESTORATION.history,
    };
  }

  if (options === true || options === undefined) {
    return { ...DEFAULT_SCROLL_RESTORATION };
  }

  return {
    enabled: true,
    navigation: options.navigation ?? DEFAULT_SCROLL_RESTORATION.navigation,
    history: options.history ?? DEFAULT_SCROLL_RESTORATION.history,
  };
}

function readScrollPosition(): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x: 0, y: 0 };
  }

  const x =
    typeof window.scrollX === 'number'
      ? window.scrollX
      : typeof window.pageXOffset === 'number'
        ? window.pageXOffset
        : 0;
  const y =
    typeof window.scrollY === 'number'
      ? window.scrollY
      : typeof window.pageYOffset === 'number'
        ? window.pageYOffset
        : 0;

  return { x, y };
}

function writeHistoryScrollPosition(
  href: string,
  position: { x: number; y: number }
): void {
  if (typeof window === 'undefined' || getWindowHref() !== href) {
    return;
  }
  if (typeof window.history?.replaceState !== 'function') {
    return;
  }
  const state =
    window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {};

  window.history.replaceState(
    {
      ...state,
      path: href,
      scroll: position,
      focus: pendingNavigationFocus ?? readFocusDescriptor(),
    },
    '',
    href
  );
  pendingNavigationFocus = undefined;
}

export function saveScrollPosition(href: string): void {
  if (!scrollRestorationOptions.enabled || typeof window === 'undefined') {
    return;
  }

  const position = readScrollPosition();
  scrollPositions.set(href, position);
  writeHistoryScrollPosition(href, position);
}

function scrollToPosition(position: { x: number; y: number }): void {
  if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') {
    return;
  }

  window.scrollTo(position.x, position.y);
}

export function applyNavigationScroll(
  behavior?: NavigationScrollBehavior
): void {
  const nextBehavior = behavior ?? scrollRestorationOptions.navigation;
  if (!scrollRestorationOptions.enabled || nextBehavior === 'preserve') {
    return;
  }

  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  if (hash && typeof document !== 'undefined') {
    const id = decodeURIComponent(hash.slice(1));
    const target = document.getElementById(id);
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'auto' });
      return;
    }
  }

  scrollToPosition({ x: 0, y: 0 });
}

export function applyHistoryScroll(
  href: string,
  state: PopStateEvent['state']
): void {
  if (!scrollRestorationOptions.enabled) {
    return;
  }

  if (scrollRestorationOptions.history === 'preserve') {
    return;
  }

  if (scrollRestorationOptions.history === 'top') {
    scrollToPosition({ x: 0, y: 0 });
    return;
  }

  const fromState =
    state && typeof state === 'object' && 'scroll' in state
      ? (state.scroll as { x?: unknown; y?: unknown })
      : undefined;
  const saved =
    fromState &&
    typeof fromState.x === 'number' &&
    typeof fromState.y === 'number'
      ? { x: fromState.x, y: fromState.y }
      : scrollPositions.get(href);

  scrollToPosition(saved ?? { x: 0, y: 0 });

  const focus =
    state &&
    typeof state === 'object' &&
    state.focus &&
    typeof state.focus === 'object'
      ? (state.focus as Partial<FocusDescriptor>)
      : undefined;
  if (
    focus &&
    (focus.attribute === 'data-askr-focus-key' ||
      focus.attribute === 'id' ||
      focus.attribute === 'name' ||
      focus.attribute === 'aria-label' ||
      focus.attribute === 'label') &&
    typeof focus.value === 'string' &&
    typeof document !== 'undefined' &&
    (document.activeElement === document.body ||
      document.activeElement === document.documentElement ||
      document.activeElement === focusAtHistoryNavigationStart)
  ) {
    const target =
      focus.attribute === 'label'
        ? Array.from(
            document.querySelectorAll<HTMLElement>(
              'input,select,textarea,button'
            )
          ).find(
            (element) =>
              'labels' in element &&
              Array.from((element as HTMLInputElement).labels ?? []).some(
                (label) => label.textContent?.trim() === focus.value
              )
          )
        : Array.from(
            document.querySelectorAll<HTMLElement>(`[${focus.attribute}]`)
          ).find(
            (element) => element.getAttribute(focus.attribute!) === focus.value
          );
    if (
      target?.isConnected &&
      !target.hasAttribute('disabled') &&
      target.getAttribute('aria-hidden') !== 'true' &&
      target.getClientRects().length > 0
    ) {
      target.focus({ preventScroll: true });
    }
  }
  focusAtHistoryNavigationStart = null;
}

export function configureScrollRestoration(
  options?: boolean | ScrollRestorationOptions
): void {
  scrollRestorationOptions = normalizeScrollRestorationOptions(options);

  if (typeof window === 'undefined') {
    return;
  }

  if ('scrollRestoration' in window.history) {
    try {
      window.history.scrollRestoration = scrollRestorationOptions.enabled
        ? 'manual'
        : 'auto';
    } catch {
      // Ignore environments that expose but do not allow setting scrollRestoration.
    }
  }
}
