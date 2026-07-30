export type NavigationScrollBehavior = 'top' | 'preserve';
export type HistoryScrollBehavior = 'restore' | 'top' | 'preserve';

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
    },
    '',
    href
  );
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
