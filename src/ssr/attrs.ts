/**
 * HTML attribute rendering for SSR
 */

import type { Props } from '../common/props';
import { getPublicAttributeName } from '../common/attr-names';
import type { RenderSink } from './sink';
import { escapeAttr, needsEscapeAttr, styleObjToCss } from './escape';

/** Result of renderAttrs including any raw HTML from dangerouslySetInnerHTML */
export type AttrsResult = {
  attrs: string;
  dangerousHtml?: string;
};

const ESCAPED_ATTR_VALUE_CACHE_LIMIT = 512;
const escapedAttrValueCache = new Map<string, string>();

function isEventHandler(key: string): boolean {
  return key.length >= 2 && key.slice(0, 2).toLowerCase() === 'on';
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
 */
export function renderAttrsDirect(
  props: Props | undefined,
  sink: Pick<RenderSink, 'write'>
): void {
  if (!props || typeof props !== 'object') return;

  const propsObj = props as Record<string, unknown>;
  for (const key in propsObj) {
    const value = propsObj[key];

    // Skip special props
    if (
      key === 'children' ||
      key === 'imperativeChildren' ||
      key === 'key' ||
      key === 'ref' ||
      key === 'dangerouslySetInnerHTML'
    )
      continue;

    // Skip event handlers
    if (isEventHandler(key)) continue;

    // Skip internal props
    if (key.charCodeAt(0) === 95) continue; // '_'

    // Normalize public JSX prop names to their rendered HTML attribute names.
    const attrName = getPublicAttributeName(key);
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

    // Boolean attributes
    if (value === true) {
      sink.write(' ');
      sink.write(attrName);
      continue;
    }

    if (value === false || value === null || value === undefined) continue;

    // Regular attributes
    const strValue = String(value);
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
 * Render attributes to HTML string, excluding event handlers
 * Optimized for minimal allocations using push-based approach
 *
 * Returns both the attribute string and any dangerouslySetInnerHTML content.
 */
export function renderAttrs(props?: Props): string;
export function renderAttrs(
  props: Props | undefined,
  opts: { returnDangerousHtml: true }
): AttrsResult;
export function renderAttrs(
  props?: Props,
  opts?: { returnDangerousHtml?: boolean }
): string | AttrsResult {
  if (!props || typeof props !== 'object') {
    return opts?.returnDangerousHtml ? { attrs: '' } : '';
  }

  const attrParts: string[] = [];
  let dangerousHtml: string | undefined;

  const propsObj = props as Record<string, unknown>;
  for (const key in propsObj) {
    const value = propsObj[key];

    // Skip children in attrs
    if (key === 'children' || key === 'imperativeChildren') continue;

    // Skip internal identity refs (framework-only)
    if (key === 'key' || key === 'ref') continue;

    // Handle dangerouslySetInnerHTML
    if (key === 'dangerouslySetInnerHTML') {
      if (value && typeof value === 'object' && '__html' in (value as object)) {
        dangerousHtml = String((value as { __html: unknown }).__html);
      }
      continue;
    }

    // Skip event handlers
    if (isEventHandler(key)) continue;

    // Skip internal props
    if (key.charCodeAt(0) === 95) continue; // '_'

    // Normalize public JSX prop names to their rendered HTML attribute names.
    const attrName = key === 'class' ? 'class' : getPublicAttributeName(key);
    assertAttributeName(attrName);

    // Handle style objects
    if (attrName === 'style') {
      const css = typeof value === 'string' ? value : styleObjToCss(value);
      if (css === null || css === '') continue;
      attrParts.push(` style="${getEscapedAttrValue(css)}"`);
      continue;
    }

    // Boolean attributes
    if (value === true) {
      attrParts.push(` ${attrName}`);
    } else if (value === false || value === null || value === undefined) {
      continue;
    } else {
      const strValue = String(value);
      attrParts.push(` ${attrName}="${getEscapedAttrValue(strValue)}"`);
    }
  }

  const result = attrParts.join('');

  if (opts?.returnDangerousHtml) {
    return { attrs: result, dangerousHtml };
  }
  return result;
}
