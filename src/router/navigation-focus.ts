/**
 * Focus and announcement after a client navigation commits.
 *
 * A page change in a single-page app leaves keyboard focus on a control that
 * may no longer exist and tells assistive technology nothing. After a push
 * navigation the router moves focus to the new page's content and announces
 * its title through a polite live region. Back/forward traversal keeps its own
 * focus restoration in `navigation-scroll.ts`.
 */

/** What an `announce` callback receives. */
export interface NavigationAnnouncement {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  /** The document title after the destination's metadata was applied; may be empty. */
  readonly title: string;
}

/** Navigation focus and announcement configuration of `createSPA()`/`hydrateSPA()`. */
export interface NavigationFocusOptions {
  /**
   * Where focus goes: a CSS selector or a function receiving the app root.
   * Defaults to the first `[data-askr-focus-target]`, then `<main>`, then the
   * first `<h1>`, then the root element.
   */
  target?: string | ((root: Element) => Element | null);
  /**
   * The text announced to assistive technology, or `false` to announce
   * nothing. Defaults to the document title, or the pathname without one.
   */
  announce?: false | ((route: NavigationAnnouncement) => string);
}

type NormalizedFocus = {
  enabled: boolean;
  target: NavigationFocusOptions['target'];
  announce: NavigationFocusOptions['announce'];
};

const DEFAULT_FOCUS: NormalizedFocus = {
  enabled: true,
  target: undefined,
  announce: undefined,
};

let focusOptions: NormalizedFocus = { ...DEFAULT_FOCUS };
let focusRoot: Element | undefined;

/** Install the focus policy for the app mounted at `root`. */
export function configureNavigationFocus(
  options: false | NavigationFocusOptions | undefined,
  root?: Element
): void {
  focusRoot = root;
  focusOptions =
    options === false
      ? { enabled: false, target: undefined, announce: undefined }
      : {
          enabled: true,
          target: options?.target,
          announce: options?.announce,
        };
}

/** @internal Return to the default policy. Part of the router-wide reset. */
export function resetNavigationFocus(): void {
  focusOptions = { ...DEFAULT_FOCUS };
  focusRoot = undefined;
  if (typeof document !== 'undefined') {
    document.querySelector('[data-askr-announcer]')?.remove();
  }
}

const NATIVELY_FOCUSABLE =
  'a[href],area[href],button,input,select,textarea,summary,[contenteditable=""],[contenteditable="true"],[tabindex]';

function resolveTarget(root: Element): Element | null {
  const { target } = focusOptions;
  if (typeof target === 'function') return target(root);
  if (typeof target === 'string') {
    return root.querySelector(target) ?? document.querySelector(target);
  }
  return (
    root.querySelector('[data-askr-focus-target]') ??
    root.querySelector('main') ??
    root.querySelector('h1') ??
    root
  );
}

function focusElement(element: Element): void {
  if (!(element instanceof HTMLElement)) return;
  if (!element.matches(NATIVELY_FOCUSABLE)) {
    element.setAttribute('tabindex', '-1');
    // The marker was only needed to receive focus; leave the DOM as authored.
    element.addEventListener(
      'blur',
      () => {
        element.removeAttribute('tabindex');
      },
      { once: true }
    );
  }
  element.focus({ preventScroll: true });
}

const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';

function announcer(): HTMLElement {
  let region = document.querySelector<HTMLElement>('[data-askr-announcer]');
  if (!region) {
    region = document.createElement('div');
    region.setAttribute('data-askr-announcer', '');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    region.setAttribute('role', 'status');
    region.setAttribute('style', VISUALLY_HIDDEN);
    document.body.append(region);
  }
  return region;
}

function announce(text: string): void {
  if (!text) return;
  const region = announcer();
  // Clear first so repeating the same text still counts as a change.
  region.textContent = '';
  queueMicrotask(() => {
    region.textContent = text;
  });
}

const NON_TEXT_INPUTS = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'radio',
  'image',
]);

/** A control the visitor may be typing into: moving focus away would lose their place. */
function isTextEntry(element: Element | null): boolean {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  if (element instanceof HTMLInputElement) {
    return !NON_TEXT_INPUTS.has(element.type);
  }
  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.isContentEditable
  );
}

/**
 * Move focus to the new page's content and announce it. Skipped when disabled,
 * or when there is no document. A text-entry control that survived the
 * navigation (a search box in a shared layout) keeps focus.
 */
export function applyNavigationFocus(location: {
  pathname: string;
  search: string;
  hash: string;
}): void {
  if (!focusOptions.enabled || typeof document === 'undefined') return;
  const root = focusRoot && focusRoot.isConnected ? focusRoot : document.body;
  if (!isTextEntry(document.activeElement)) {
    const target = resolveTarget(root);
    if (target) focusElement(target);
  }

  if (focusOptions.announce === false) return;
  const route: NavigationAnnouncement = Object.freeze({
    ...location,
    title: document.title,
  });
  announce(
    focusOptions.announce
      ? focusOptions.announce(route)
      : route.title || location.pathname
  );
}
