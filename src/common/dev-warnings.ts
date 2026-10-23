/**
 * Development-only diagnostics shared by the DOM renderer and SSR. Every
 * helper is silent in production and reports each distinct problem once.
 */

import { isDevelopmentEnvironment } from './env';
import { logger } from './logger';

const SEEN_LIMIT = 256;
const seen = new Set<string>();

/** Warn once per `key` in development; cleared at a limit so data cannot grow it. */
export function warnOnce(key: string, message: string): void {
  if (!isDevelopmentEnvironment() || seen.has(key)) return;
  if (seen.size >= SEEN_LIMIT) seen.clear();
  seen.add(key);
  logger.warn(message);
}

/** Warn once per object (an element, a promise, a node) in development. */
export function warnOncePerObject(
  objects: WeakSet<object>,
  value: object,
  message: string
): void {
  if (!isDevelopmentEnvironment() || objects.has(value)) return;
  objects.add(value);
  logger.warn(message);
}

/** Elements whose start tag makes the HTML parser close an open `<p>`. */
const CLOSES_PARAGRAPH = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'dialog',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'search',
  'section',
  'table',
  'ul',
]);

const TABLE_SECTIONS = new Set(['tbody', 'thead', 'tfoot']);

/** Pairs the HTML parser rewrites: [parent, child] -> why. */
function nestingProblem(parent: string, child: string): string | null {
  if (parent === 'p' && CLOSES_PARAGRAPH.has(child)) {
    return `the parser closes the <p> before <${child}>`;
  }
  if (parent === 'table' && child === 'tr') {
    return 'the parser inserts a <tbody> around the <tr>';
  }
  if (parent === 'table' && TABLE_SECTIONS.has(child)) return null;
  if ((parent === 'a' || parent === 'button') && child === parent) {
    return `<${parent}> cannot contain another <${parent}>`;
  }
  if (parent === 'form' && child === 'form') {
    return '<form> cannot contain another <form>';
  }
  return null;
}

/**
 * Warn when `child` inside `parent` is markup the HTML parser rewrites, so the
 * server's markup would not match the client's tree.
 */
export function warnInvalidNesting(
  parent: string,
  child: string,
  source: 'client' | 'server'
): void {
  if (!isDevelopmentEnvironment()) return;
  // Client DOM creation builds a row in a table without a tbody; only
  // parsed (server) markup gets the tbody.
  if (source === 'client' && parent === 'table' && child === 'tr') return;
  const problem = nestingProblem(parent, child);
  if (!problem) return;
  warnOnce(
    `nesting:${parent}>${child}`,
    `[Askr] Invalid nesting: <${child}> inside <${parent}> (${problem}), so server markup will not match the client tree.`
  );
}

/** Lowercase DOM event names an `on*` prop on a built-in element may name. */
const KNOWN_EVENTS = new Set(
  (
    'abort afterprint animationcancel animationend animationiteration ' +
    'animationstart auxclick beforeinput beforematch beforeprint beforetoggle ' +
    'beforeunload blur cancel canplay canplaythrough change click close ' +
    'command compositionend compositionstart compositionupdate contextlost ' +
    'contextmenu contextrestored copy cuechange cut dblclick drag dragend ' +
    'dragenter dragexit dragleave dragover dragstart drop durationchange ' +
    'emptied ended error focus focusin focusout formdata fullscreenchange ' +
    'fullscreenerror gotpointercapture hashchange input invalid keydown ' +
    'keypress keyup languagechange load loadeddata loadedmetadata loadstart ' +
    'lostpointercapture message messageerror mousedown mouseenter mouseleave ' +
    'mousemove mouseout mouseover mouseup offline online orientationchange ' +
    'pagehide pageshow paste pause play playing pointercancel pointerdown ' +
    'pointerenter pointerleave pointermove pointerout pointerover pointerrawupdate ' +
    'pointerup popstate progress ratechange readystatechange reset resize ' +
    'scroll scrollend securitypolicyviolation seeked seeking select ' +
    'selectionchange selectstart slotchange stalled storage submit suspend ' +
    'timeupdate toggle touchcancel touchend touchmove touchstart ' +
    'transitioncancel transitionend transitionrun transitionstart unhandledrejection ' +
    'unload volumechange waiting wheel gesturechange gestureend gesturestart ' +
    'webkitmouseforcechanged beforecopy beforecut beforepaste'
  ).split(' ')
);

/** Whether `name` (lowercase, no `on`) is a DOM event a built-in element can fire. */
export function isKnownDomEvent(name: string): boolean {
  return KNOWN_EVENTS.has(name);
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return row[b.length];
}

const EVENT_PROP_NAMES: Record<string, string> = {
  dblclick: 'onDblClick',
  keydown: 'onKeyDown',
  keypress: 'onKeyPress',
  keyup: 'onKeyUp',
  mousedown: 'onMouseDown',
  mouseenter: 'onMouseEnter',
  mouseleave: 'onMouseLeave',
  mousemove: 'onMouseMove',
  mouseout: 'onMouseOut',
  mouseover: 'onMouseOver',
  mouseup: 'onMouseUp',
  pointerdown: 'onPointerDown',
  pointerup: 'onPointerUp',
  pointermove: 'onPointerMove',
  pointercancel: 'onPointerCancel',
  pointerenter: 'onPointerEnter',
  pointerleave: 'onPointerLeave',
  pointerover: 'onPointerOver',
  pointerout: 'onPointerOut',
  touchstart: 'onTouchStart',
  touchend: 'onTouchEnd',
  touchmove: 'onTouchMove',
  touchcancel: 'onTouchCancel',
  focusin: 'onFocusIn',
  focusout: 'onFocusOut',
  contextmenu: 'onContextMenu',
  dragstart: 'onDragStart',
  dragend: 'onDragEnd',
  dragenter: 'onDragEnter',
  dragleave: 'onDragLeave',
  dragover: 'onDragOver',
};

function suggestion(name: string): string | null {
  let best: string | null = null;
  let bestDistance = 3;
  for (const known of KNOWN_EVENTS) {
    const d = distance(name, known);
    if (d < bestDistance) {
      bestDistance = d;
      best = known;
    }
  }
  if (!best) return null;
  return EVENT_PROP_NAMES[best] ?? `on${best[0].toUpperCase()}${best.slice(1)}`;
}

/** Warn about an `on*` handler prop whose event is not a DOM event. */
export function warnUnknownEventProp(
  prop: string,
  eventName: string,
  tag: string
): void {
  if (!isDevelopmentEnvironment()) return;
  if (tag.includes('-') || isKnownDomEvent(eventName)) return;
  const hint = suggestion(eventName);
  warnOnce(
    `event:${prop}`,
    `[Askr] Unknown event prop "${prop}" on <${tag}> matches no DOM event, so its handler never runs.` +
      (hint ? ` Did you mean "${hint}"?` : '')
  );
}
