/**
 * HTML attribute rendering for SSR
 */

import type { Props } from '../common/props';
import {
  getPublicAttributeName,
  isCustomElementName,
} from '../common/attr-names';
import {
  booleanAttributeValue,
  isSkippedProp,
  keepsFalseValue,
} from '../common/prop-classification';
import { isUnsafeUrlAttribute, rejectUnsafeUrlAttribute } from '../common/url';
import {
  ATTRIBUTE_PROP_PREFIX,
  isPropertyOnlyProp,
} from '../common/dom-properties';
import type { RenderSink } from './sink';
import { escapeAttr, needsEscapeAttr, styleObjToCss } from './escape';
import { readUntracked } from '../runtime';

const ESCAPED_ATTR_VALUE_CACHE_LIMIT = 512;
const escapedAttrValueCache = new Map<string, string>();

function isEventHandler(key: string): boolean {
  return key.length >= 2 && key.slice(0, 2).toLowerCase() === 'on';
}

/**
 * A function or readable prop is reactive on the client; the server renders
 * its current value once, without subscribing to it.
 */
function resolvePropValue(value: unknown): unknown {
  return typeof value === 'function'
    ? readUntracked(value as () => unknown)
    : value;
}

/**
 * `props` with every function or readable attribute value read once, for an
 * element whose attributes are inspected before they are written. Returns
 * `props` itself when nothing needs reading.
 */
export function resolveReactiveAttributeProps(
  props: Props | undefined
): Props | undefined {
  if (!props || typeof props !== 'object') return props;
  let resolved: Record<string, unknown> | null = null;
  const propsObj = props as Record<string, unknown>;
  for (const key in propsObj) {
    const value = propsObj[key];
    if (
      typeof value !== 'function' ||
      isSkippedProp(key) ||
      isEventHandler(key)
    ) {
      continue;
    }
    resolved ??= { ...propsObj };
    resolved[key] = resolvePropValue(value);
  }
  return (resolved as Props | null) ?? props;
}

function assertAttributeName(name: string): void {
  if (!/^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(name)) {
    throw new TypeError(`Invalid SSR attribute name: ${JSON.stringify(name)}`);
  }
}

function getEscapedAttrValue(value: string): string {
  if (value.length > 64) {
    return escapeAttr(value);
  }

  const cached = escapedAttrValueCache.get(value);
  if (cached !== undefined) {
    return cached;
  }

  const escaped = escapeAttr(value);
  // Skip caching strings that required no escaping — same reference returned,
  // no point occupying cache slots with identity entries.
  if (escaped === value) return value;
  if (escapedAttrValueCache.size >= ESCAPED_ATTR_VALUE_CACHE_LIMIT) {
    escapedAttrValueCache.clear();
  }
  escapedAttrValueCache.set(value, escaped);
  return escaped;
}

/**
 * Render attributes directly to a sink without intermediate string allocations.
 * This is the hot path for streaming SSR.
 *
 * Props the DOM renderer writes only as properties (`prop:*`, `indeterminate`,
 * object values on custom elements) have no markup and are left out; the
 * client applies them when it hydrates.
 */
export function renderAttrsDirect(
  props: Props | undefined,
  sink: Pick<RenderSink, 'write'>,
  tagName = ''
): void {
  if (!props || typeof props !== 'object') return;
  const customElement = isCustomElementName(tagName);

  const propsObj = props as Record<string, unknown>;
  for (const key in propsObj) {
    // Skip special props
    if (isSkippedProp(key) || key === 'dangerouslySetInnerHTML') continue;

    // Skip event handlers
    if (isEventHandler(key)) continue;

    // Skip internal props
    if (key.charCodeAt(0) === 95) continue; // '_'

    const value = resolvePropValue(propsObj[key]);
    if (isPropertyOnlyProp(tagName, key, value)) continue;
    // `attr:` renders text only; objects (even `attr:style`) are left out on
    // both sides rather than serialized differently.
    if (
      value !== null &&
      typeof value === 'object' &&
      key.startsWith(ATTRIBUTE_PROP_PREFIX)
    )
      continue;

    // Normalize public JSX prop names to their rendered HTML attribute names.
    const attrName = getPublicAttributeName(key, customElement);
    // `attr:` never smuggles an inline event handler past the check above.
    if (attrName !== key && isEventHandler(attrName)) continue;
    assertAttributeName(attrName);

    // Handle style objects
    if (attrName === 'style') {
      const css = typeof value === 'string' ? value : styleObjToCss(value);
      if (!css) continue;
      sink.write(' style="');
      // Escape inline - most style values don't need escaping
      if (needsEscapeAttr(css)) {
        sink.write(getEscapedAttrValue(css));
      } else {
        sink.write(css);
      }
      sink.write('"');
      continue;
    }

    // Boolean attributes render bare; ARIA state and data payloads keep "true".
    if (value === true) {
      sink.write(' ');
      sink.write(attrName);
      const booleanValue = booleanAttributeValue(attrName);
      if (booleanValue) {
        sink.write('="');
        sink.write(booleanValue);
        sink.write('"');
      }
      continue;
    }

    if (
      value === null ||
      value === undefined ||
      (value === false && !keepsFalseValue(attrName))
    )
      continue;

    // Regular attributes
    const strValue = String(value);
    if (rejectUnsafeUrlAttribute(attrName, strValue)) continue;
    sink.write(' ');
    sink.write(attrName);
    sink.write('="');
    // escapeAttr returns the original string when nothing needs escaping,
    // so no separate needsEscapeAttr pre-scan is required.
    sink.write(getEscapedAttrValue(strValue));
    sink.write('"');
  }
}

/**
 * The value the HTML parser sees for attribute `name` (lower-case) on an
 * element whose attributes `renderAttrsDirect` writes, or `null` when it is
 * not written. Mirrors the emitted attributes: names compare
 * case-insensitively and the first written occurrence wins, as the parser
 * drops later duplicates.
 */
export function getRenderedAttributeValue(
  props: Props | undefined,
  name: string
): string | null {
  if (!props || typeof props !== 'object') return null;

  const propsObj = props as Record<string, unknown>;
  for (const key in propsObj) {
    if (isSkippedProp(key) || key === 'dangerouslySetInnerHTML') continue;
    if (isEventHandler(key)) continue;
    if (key.charCodeAt(0) === 95) continue;

    const attrName = getPublicAttributeName(key);
    if (attrName.toLowerCase() !== name) continue;

    const value = resolvePropValue(propsObj[key]);
    if (attrName === 'style') {
      const css = typeof value === 'string' ? value : styleObjToCss(value);
      if (!css) continue;
      return css;
    }
    if (value === true) return booleanAttributeValue(attrName);
    if (
      value === null ||
      value === undefined ||
      (value === false && !keepsFalseValue(attrName))
    )
      continue;
    const strValue = String(value);
    if (isUnsafeUrlAttribute(attrName, strValue)) continue;
    return strValue;
  }
  return null;
}
