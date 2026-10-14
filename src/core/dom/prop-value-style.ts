/** Style values rewrite only the properties owned by the preceding value. */
import { sanitizeCssValue } from '../../common/css';
import {
  normalizeStylePropertyName,
  styleValueText,
} from '../../common/prop-classification';

type StyleEntries = Map<string, string>;

const IMPORTANT_SUFFIX = ' !important';

function readStyleEntry(
  style: CSSStyleDeclaration,
  propertyName: string
): string {
  return (
    style.getPropertyValue(propertyName) +
    (style.getPropertyPriority(propertyName) ? IMPORTANT_SUFFIX : '')
  );
}

function collectStyleEntries(style: CSSStyleDeclaration): StyleEntries {
  const entries: StyleEntries = new Map();
  for (let index = 0; index < style.length; index += 1) {
    const propertyName = style.item(index);
    entries.set(propertyName, readStyleEntry(style, propertyName));
  }
  return entries;
}

function normalizeStyleEntries(value: unknown): StyleEntries | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const entries: StyleEntries = new Map();
  for (const [key, entryValue] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (
      entryValue === undefined ||
      entryValue === null ||
      entryValue === false
    ) {
      continue;
    }

    const propertyName = normalizeStylePropertyName(key);
    const safeValue = sanitizeCssValue(
      styleValueText(propertyName, entryValue)
    );
    if (safeValue) {
      entries.set(propertyName, safeValue);
    }
  }

  return entries;
}

let scratchStyle: CSSStyleDeclaration | null = null;

/** Style entries a prop value renders; `null` when it is not expressible. */
function readStyleEntries(el: Element, value: unknown): StyleEntries | null {
  if (value === null || value === undefined || value === false) {
    return new Map();
  }
  if (typeof value !== 'string') {
    return normalizeStyleEntries(value);
  }

  // Parse on a detached declaration so the target element is not touched.
  scratchStyle ??= el.ownerDocument.createElement('div').style;
  scratchStyle.cssText = value;
  const entries = collectStyleEntries(scratchStyle);
  scratchStyle.cssText = '';
  return entries;
}

/**
 * Apply a `style` prop. `previousValue` is the value Askr last applied
 * (`null` when none): only the properties it owns are removed or rewritten, so
 * properties set by other code survive. When `previousValue` is `undefined`
 * the element's whole style is treated as Askr-owned.
 */
export function applyStylePropValue(
  el: Element,
  value: unknown,
  previousValue?: unknown
): void {
  const style = (el as HTMLElement | SVGElement).style;
  const isEmpty = value === null || value === undefined || value === false;
  if (!style) {
    if (isEmpty) {
      el.removeAttribute('style');
      return;
    }

    el.setAttribute('style', String(value));
    return;
  }

  if (
    (el.getAttribute('style') ?? '') === (isEmpty ? '' : value) ||
    (isEmpty && previousValue === null)
  ) {
    return;
  }

  if (previousValue === undefined && (isEmpty || typeof value === 'string')) {
    style.cssText = isEmpty ? '' : (value as string);
    if (isEmpty) el.removeAttribute('style');
    return;
  }

  const nextEntries = readStyleEntries(el, value);
  if (!nextEntries) {
    style.cssText = String(value);
    return;
  }
  // An unknown or unparseable baseline treats the whole style as Askr-owned.
  const previousEntries =
    (previousValue === undefined
      ? null
      : previousValue === value
        ? nextEntries
        : readStyleEntries(el, previousValue)) ?? collectStyleEntries(style);

  let didWrite = false;
  for (const [propertyName] of previousEntries) {
    if (nextEntries.has(propertyName) || !style.getPropertyValue(propertyName))
      continue;
    style.removeProperty(propertyName);
    didWrite = true;
  }

  for (const [propertyName, propertyValue] of nextEntries) {
    if (readStyleEntry(style, propertyName) === propertyValue) continue;
    const important = propertyValue.endsWith(IMPORTANT_SUFFIX);
    style.setProperty(
      propertyName,
      important
        ? propertyValue.slice(0, -IMPORTANT_SUFFIX.length)
        : propertyValue,
      important ? 'important' : ''
    );
    didWrite = true;
  }

  if (isEmpty && style.length === 0) {
    el.removeAttribute('style');
    didWrite = true;
  }

  if (!didWrite) {
  }
}
