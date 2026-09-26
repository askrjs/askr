import { isCustomElementName } from '../../common/attr-names';
import {
  domPropertyValue,
  getDomPropertyName,
  isKnownBooleanProperty,
  PROPERTY_PROP_PREFIX,
  propertyReflectsAttribute,
} from '../../common/dom-properties';
import { isDevelopmentEnvironment } from '../../common/env';
import { logger } from '../../common/logger';
import {
  rejectUnsafeUrlAttribute,
  SCRIPT_URL_RESOURCE_ATTRIBUTES,
  UNSAFE_URL_SCHEME_ATTRIBUTES,
} from '../../common/url';
import { incrementPerfMetric } from '../../runtime';
import { getRenderedAttributeName } from '../utils';

/**
 * Per element, the props Askr wrote as DOM properties, mapped to the property
 * name. A property cannot be "removed" like an attribute, so this is what lets
 * an absent prop reset its property and a failed commit put the old values
 * back.
 */
const writtenDomProperties = new WeakMap<Element, Map<string, string>>();

type PropertyHost = Element & Record<string, unknown>;

/**
 * Property names `prop:` never assigns: raw HTML sinks (use
 * `dangerouslySetInnerHTML`) and names that would change the prototype chain.
 */
const BLOCKED_PROPERTY_NAMES = new Set([
  'innerHTML',
  'outerHTML',
  'srcdoc',
  '__proto__',
  'constructor',
  'prototype',
]);

function isBlockedPropertyName(name: string): boolean {
  if (!BLOCKED_PROPERTY_NAMES.has(name)) return false;
  if (isDevelopmentEnvironment()) {
    logger.warn(`[Askr] ${PROPERTY_PROP_PREFIX}${name} is ignored.`);
  }
  return true;
}

function isUrlPropertyName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    UNSAFE_URL_SCHEME_ATTRIBUTES.has(lower) ||
    SCRIPT_URL_RESOURCE_ATTRIBUTES.has(lower)
  );
}

function writeProperty(el: Element, name: string, value: unknown): void {
  const host = el as PropertyHost;
  if (Object.is(host[name], value)) {
    incrementPerfMetric('skippedDomPropWrites');
    return;
  }
  host[name] = value;
}

/**
 * Put a property back to its default once Askr no longer sets it.
 *
 * - `muted`/`indeterminate` become `false`.
 * - A property with a same-named attribute (`href`, `title`, `hidden`,
 *   `className` -> `class`, ...) has that attribute removed, which restores
 *   the element's own default.
 * - An own property (an expando, or a value set before a custom element
 *   upgraded) is deleted.
 * - Otherwise strings become `''` and booleans `false`. Numbers keep their
 *   value (there is no safe generic default), and anything else becomes
 *   `undefined`.
 */
function resetProperty(el: Element, key: string, name: string): void {
  const host = el as PropertyHost;
  if (isKnownBooleanProperty(key)) {
    writeProperty(el, name, false);
    return;
  }
  const attributeName = getRenderedAttributeName(el, name);
  if (el.hasAttribute(attributeName)) {
    el.removeAttribute(attributeName);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(host, name)) {
    delete host[name];
    return;
  }
  const current = host[name];
  if (typeof current === 'number') return;
  writeProperty(
    el,
    name,
    typeof current === 'string'
      ? ''
      : typeof current === 'boolean'
        ? false
        : undefined
  );
}

function forgetProperty(el: Element, key: string): void {
  const written = writtenDomProperties.get(el);
  const name = written?.get(key);
  if (name === undefined) return;
  written!.delete(key);
  resetProperty(el, key, name);
}

/**
 * Write a prop that targets a DOM property.
 *
 * Returns `true` when the prop is fully handled, and `false` when the caller
 * must still run the attribute path: for attribute props, and for `muted`,
 * which keeps its attribute alongside the property. A prop that was a
 * property and is now an attribute (a custom element prop that went from an
 * object to a string or `null`) has its property reset first.
 */
export function applyDomPropertyProp(
  el: Element,
  key: string,
  value: unknown,
  tagName: string
): boolean {
  const name = getDomPropertyName(tagName, key, value);

  if (name === null) {
    // Only a custom element prop can move from a property to an attribute.
    if (isCustomElementName(tagName)) forgetProperty(el, key);
    return false;
  }

  if (isBlockedPropertyName(name)) return true;

  let next = domPropertyValue(key, value);
  if (next !== null && next !== undefined && isUrlPropertyName(name)) {
    // Built-in URL properties are strings anyway: convert once, check that
    // text, and assign the same text, so a stateful `toString()` cannot pass
    // the check and then return something else. Custom elements keep their
    // value; it is still checked.
    const text = String(next);
    if (rejectUnsafeUrlAttribute(name, text)) {
      forgetProperty(el, key);
      return true;
    }
    if (!isCustomElementName(tagName)) next = text;
  }

  let written = writtenDomProperties.get(el);
  if (!written) {
    written = new Map();
    writtenDomProperties.set(el, written);
  }
  if (!written.has(key)) {
    written.set(key, name);
    // A custom element prop that was an attribute: drop the old attribute so
    // it does not contradict the property.
    if (!key.startsWith(PROPERTY_PROP_PREFIX) && !isKnownBooleanProperty(key)) {
      const attributeName = getRenderedAttributeName(el, key);
      if (el.hasAttribute(attributeName)) el.removeAttribute(attributeName);
    }
  }
  writeProperty(el, name, next);
  return !propertyReflectsAttribute(key);
}

/** Reset the properties of props that are no longer passed. */
export function pruneStaleDomProperties(
  el: Element,
  props: Record<string, unknown>
): void {
  const written = writtenDomProperties.get(el);
  if (!written) return;

  for (const [key, name] of written) {
    if (Object.prototype.hasOwnProperty.call(props, key)) continue;
    written.delete(key);
    resetProperty(el, key, name);
  }
}

/** Whether Askr currently sets `key` on `el` as a DOM property. */
export function hasWrittenDomProperty(el: Element, key: string): boolean {
  return writtenDomProperties.get(el)?.has(key) === true;
}

/** Whether Askr wrote a property for a prop missing from `props`. */
export function hasStaleDomProperties(
  el: Element,
  props: Record<string, unknown>
): boolean {
  const written = writtenDomProperties.get(el);
  if (!written) return false;
  for (const key of written.keys()) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) return true;
  }
  return false;
}

/** Properties Askr wrote on one element (`[key, name, value]`), for rollback. */
export type DomPropertySnapshot = ReadonlyArray<[string, string, unknown]>;

/** @internal Capture the written properties and their current values. */
export function snapshotDomProperties(
  el: Element
): DomPropertySnapshot | undefined {
  const written = writtenDomProperties.get(el);
  if (!written || written.size === 0) return undefined;
  return Array.from(written, ([key, name]) => [
    key,
    name,
    (el as PropertyHost)[name],
  ]);
}

/**
 * @internal Put back what `snapshotDomProperties` captured: properties first
 * written by the failed commit are reset, the rest get their old values.
 */
export function restoreDomProperties(
  el: Element,
  snapshot: DomPropertySnapshot | undefined
): void {
  const written = writtenDomProperties.get(el);
  const previousKeys = new Set(snapshot?.map(([key]) => key));
  if (written) {
    for (const [key, name] of written) {
      if (!previousKeys.has(key)) resetProperty(el, key, name);
    }
  }
  if (!snapshot) {
    writtenDomProperties.delete(el);
    return;
  }
  const restored = new Map<string, string>();
  for (const [key, name, value] of snapshot) {
    restored.set(key, name);
    writeProperty(el, name, value);
  }
  writtenDomProperties.set(el, restored);
}
