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
 * Optimized for minimal allocations
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

  let result = '';
  let dangerousHtml: string | undefined;

  // Perf: avoid Object.entries allocation in tight SSR loops.
  // Also skip non-own keys defensively.
  // eslint-disable-next-line no-restricted-syntax
  for (const key in props as Record<string, unknown>) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
    const value = (props as Record<string, unknown>)[key];
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
    // Must have at least 3 chars and 3rd char must be uppercase
    if (
      key.length >= 3 &&
      key[0] === 'o' &&
      key[1] === 'n' &&
      key[2] >= 'A' &&
      key[2] <= 'Z'
    ) {
      continue;
    }

    // Skip internal props
    if (key.startsWith('_')) continue;

    // Normalize class attribute (`class` preferred, accept `className` for compatibility)
    const attrName = key === 'class' || key === 'className' ? 'class' : key;

    // Handle style objects
    if (attrName === 'style') {
      const css = typeof value === 'string' ? value : styleObjToCss(value);
      if (css === null || css === '') continue;
      result += ` style="${escapeAttr(css)}"`;
      continue;
    }

    // Boolean attributes
    if (value === true) {
      result += ` ${attrName}`;
    } else if (value === false || value === null || value === undefined) {
      // Skip falsy values
      continue;
    } else {
      // Regular attributes
      result += ` ${attrName}="${escapeAttr(String(value))}"`;
    }
  }

  if (opts?.returnDangerousHtml) {
    return { attrs: result, dangerousHtml };
  }
  return result;
}
