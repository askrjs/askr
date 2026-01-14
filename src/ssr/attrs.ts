/**
 * HTML attribute rendering for SSR
 */

import type { Props } from '../common/props';
import { escapeAttr, styleObjToCss } from './escape';

/** Result of renderAttrs including any raw HTML from dangerouslySetInnerHTML */
export type AttrsResult = {
  attrs: string;
  dangerousHtml?: string;
};

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

  // Perf optimization: iterate props once and build attribute strings
  // Fast path for common patterns with inlined checks
  const propsObj = props as Record<string, unknown>;
  for (const key in propsObj) {
    const value = propsObj[key];

    // Skip children in attrs
    if (key === 'children') continue;

    // Skip internal identity refs (framework-only)
    if (key === 'key' || key === 'ref') continue;

    // Handle dangerouslySetInnerHTML
    if (key === 'dangerouslySetInnerHTML') {
      if (value && typeof value === 'object' && '__html' in (value as object)) {
        dangerousHtml = String((value as { __html: unknown }).__html);
      }
      continue;
    }

    // Skip event handlers (onClick, onChange, etc.)
    // Perf: inline check avoids function call overhead
    const keyLen = key.length;
    if (
      keyLen >= 3 &&
      key[0] === 'o' &&
      key[1] === 'n' &&
      key.charCodeAt(2) >= 65 && // 'A'
      key.charCodeAt(2) <= 90 // 'Z'
    ) {
      continue;
    }

    // Skip internal props
    if (key.length > 0 && key[0] === '_') continue;

    // Normalize class attribute (`class` preferred, accept `className` for compatibility)
    const attrName = key === 'class' || key === 'className' ? 'class' : key;

    // Handle style objects
    if (attrName === 'style') {
      const css = typeof value === 'string' ? value : styleObjToCss(value);
      if (css === null || css === '') continue;
      // Inline escaped style attribute directly
      attrParts.push(` style="${escapeAttr(css)}"`);
      continue;
    }

    // Boolean attributes
    if (value === true) {
      attrParts.push(` ${attrName}`);
    } else if (value === false || value === null || value === undefined) {
      // Skip falsy values
      continue;
    } else {
      // Regular attributes - inline escape check for performance
      const strValue = String(value);
      // Escape the value directly inline to avoid function call overhead
      attrParts.push(` ${attrName}="${escapeAttr(strValue)}"`);
    }
  }

  const result = attrParts.join('');

  if (opts?.returnDangerousHtml) {
    return { attrs: result, dangerousHtml };
  }
  return result;
}
