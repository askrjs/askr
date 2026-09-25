import { isCustomElementName } from '../../common/attr-names';
import {
  getDomPropertyName,
  isKnownBooleanProperty,
  PROPERTY_PROP_PREFIX,
  propertyReflectsAttribute,
} from '../../common/dom-properties';
import { isDevelopmentEnvironment } from '../../common/env';
import { logger } from '../../common/logger';
import { isUnsafeUrlAttribute } from '../../common/url';
import { incrementPerfMetric } from '../../runtime';
import { getRenderedAttributeName } from '../utils';

/** One prop Askr wrote as a DOM property. */
interface WrittenProperty {
  name: string;
  /** Attributes the element added or changed when the property was set. */
  reflected: string[];
}

/**
 * Per element, the props Askr wrote as DOM properties. A property cannot be
 * "removed" like an attribute, so this is what lets an absent prop reset its
 * property, lets stale-attribute removal keep the attributes those properties
 * reflect, and lets a failed commit put the previous values back.
 */
const writtenDomProperties = new WeakMap<
  Element,
  Map<string, WrittenProperty>
>();

type PropertyHost = Element & Record<string, unknown>;

/**
 * Property names `prop:` never assigns: raw HTML sinks (use
 * `dangerouslySetInnerHTML`) and names that would change the element's
 * prototype chain.
 */
const BLOCKED_PROPERTY_NAMES = new Set([
  'innerHTML',
  'outerHTML',
  'srcdoc',
  '__proto__',
  'constructor',
  'prototype',
]);

function propertyValue(key: string, value: unknown): unknown {
  return isKnownBooleanProperty(key) ? Boolean(value) : value;
}

function isBlockedPropertyName(name: string): boolean {
  if (!BLOCKED_PROPERTY_NAMES.has(name)) return false;
  if (isDevelopmentEnvironment()) {
    logger.warn(
      `[Askr] ${PROPERTY_PROP_PREFIX}${name} is ignored.` +
        (name.endsWith('HTML') || name === 'srcdoc'
          ? ' Use dangerouslySetInnerHTML to write raw HTML.'
          : '')
    );
  }
  return true;
}

function findPropertyDescriptor(
  target: object,
  name: string
): PropertyDescriptor | undefined {
  for (
    let current: object | null = target;
    current;
    current = Object.getPrototypeOf(current) as object | null
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) return descriptor;
  }
  return undefined;
}

function assignProperty(el: Element, name: string, value: unknown): void {
  try {
    (el as PropertyHost)[name] = value;
  } catch (error) {
    const descriptor = findPropertyDescriptor(el, name);
    if (
      descriptor &&
      (descriptor.writable === false ||
        (descriptor.get !== undefined && descriptor.set === undefined))
    ) {
      throw new TypeError(
        `[Askr] ${PROPERTY_PROP_PREFIX}${name} cannot be set: ` +
          `<${el.localName}>.${name} is read-only.`
      );
    }
    throw error;
  }
}

function readAttributes(el: Element): Map<string, string> {
  const values = new Map<string, string>();
  const attributes = el.attributes;
  for (let index = 0; index < attributes.length; index += 1) {
    const attribute = attributes.item(index)!;
    values.set(attribute.name, attribute.value);
  }
  return values;
}

/** Assign a property, recording the attributes the element reflects it to. */
function writeProperty(
  el: Element,
  entry: WrittenProperty,
  value: unknown
): void {
  if (Object.is((el as PropertyHost)[entry.name], value)) {
    incrementPerfMetric('skippedDomPropWrites');
    return;
  }
  const before = readAttributes(el);
  assignProperty(el, entry.name, value);
  const attributes = el.attributes;
  for (let index = 0; index < attributes.length; index += 1) {
    const attribute = attributes.item(index)!;
    if (
      before.get(attribute.name) !== attribute.value &&
      !entry.reflected.includes(attribute.name)
    ) {
      entry.reflected.push(attribute.name);
    }
  }
}

/**
 * Put a property back to its default once Askr no longer sets it.
 *
 * - `muted`/`indeterminate` become `false`.
 * - A property that reflects to attributes (`href`, `title`, `hidden`,
 *   `className`, ...) has those attributes removed, which restores the
 *   element's own default.
 * - An own property (an expando, or a value set before a custom element
 *   upgraded) is deleted.
 * - Otherwise strings become `''` and booleans `false`. Numbers keep their
 *   value (there is no safe generic default), and anything else becomes
 *   `undefined`.
 */
function resetProperty(el: Element, key: string, entry: WrittenProperty): void {
  const host = el as PropertyHost;
  if (isKnownBooleanProperty(key)) {
    assignProperty(el, entry.name, false);
    return;
  }
  if (entry.reflected.length > 0) {
    for (const attributeName of entry.reflected) {
      el.removeAttribute(attributeName);
    }
    return;
  }
  if (Object.prototype.hasOwnProperty.call(host, entry.name)) {
    delete host[entry.name];
    return;
  }
  const current = host[entry.name];
  if (typeof current === 'number') return;
  assignProperty(
    el,
    entry.name,
    typeof current === 'string'
      ? ''
      : typeof current === 'boolean'
        ? false
        : undefined
  );
}

function forgetProperty(el: Element, key: string): void {
  const written = writtenDomProperties.get(el);
  const entry = written?.get(key);
  if (!entry) return;
  written!.delete(key);
  resetProperty(el, key, entry);
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

  const next = propertyValue(key, value);
  // The URL guard covers every value a URL property would stringify:
  // strings, `URL` objects, anything with a `toString`.
  if (next !== null && next !== undefined && isUnsafeUrlAttribute(name, next)) {
    forgetProperty(el, key);
    return true;
  }

  let written = writtenDomProperties.get(el);
  if (!written) {
    written = new Map();
    writtenDomProperties.set(el, written);
  }
  let entry = written.get(key);
  if (!entry) {
    entry = { name, reflected: [] };
    written.set(key, entry);
    // A custom element prop that was an attribute: drop the old attribute so
    // it does not contradict the property.
    if (!key.startsWith(PROPERTY_PROP_PREFIX) && !isKnownBooleanProperty(key)) {
      const attributeName = getRenderedAttributeName(el, key);
      if (el.hasAttribute(attributeName)) el.removeAttribute(attributeName);
    }
  }
  writeProperty(el, entry, next);
  return !propertyReflectsAttribute(key);
}

/** Reset the properties of props that are no longer passed. */
export function pruneStaleDomProperties(
  el: Element,
  props: Record<string, unknown>
): void {
  const written = writtenDomProperties.get(el);
  if (!written) return;

  for (const [key, entry] of written) {
    if (Object.prototype.hasOwnProperty.call(props, key)) continue;
    written.delete(key);
    resetProperty(el, key, entry);
  }
}

/**
 * Attributes that properties Askr set are reflecting, which stale-attribute
 * removal must keep.
 */
export function getReflectedAttributes(el: Element): readonly string[] {
  const written = writtenDomProperties.get(el);
  if (!written) return [];
  const names: string[] = [];
  for (const entry of written.values()) names.push(...entry.reflected);
  return names;
}

/**
 * For the static-props fast paths: whether a property prop already holds the
 * value, or `null` when the prop is an attribute and must be compared there.
 */
export function matchesDomPropertyProp(
  el: Element,
  key: string,
  value: unknown,
  tagName: string
): boolean | null {
  const name = getDomPropertyName(tagName, key, value);
  if (name === null) return null;
  return Object.is((el as PropertyHost)[name], propertyValue(key, value));
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

/** Snapshot of the properties Askr wrote on one element, for rollback. */
export interface DomPropertySnapshot {
  entries: ReadonlyArray<[string, WrittenProperty, unknown]>;
}

/** @internal Capture the written properties and their current values. */
export function snapshotDomProperties(
  el: Element
): DomPropertySnapshot | undefined {
  const written = writtenDomProperties.get(el);
  if (!written || written.size === 0) return undefined;
  const entries: Array<[string, WrittenProperty, unknown]> = [];
  for (const [key, entry] of written) {
    entries.push([
      key,
      { name: entry.name, reflected: [...entry.reflected] },
      (el as PropertyHost)[entry.name],
    ]);
  }
  return { entries };
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
  const previousKeys = new Set(snapshot?.entries.map(([key]) => key));
  if (written) {
    for (const [key, entry] of written) {
      if (!previousKeys.has(key)) resetProperty(el, key, entry);
    }
  }
  if (!snapshot) {
    writtenDomProperties.delete(el);
    return;
  }
  const restored = new Map<string, WrittenProperty>();
  for (const [key, entry, value] of snapshot.entries) {
    restored.set(key, entry);
    if (!Object.is((el as PropertyHost)[entry.name], value)) {
      assignProperty(el, entry.name, value);
    }
  }
  writtenDomProperties.set(el, restored);
}
