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
import { getRenderedAttributeName } from './element-attributes';

/**
 * Per element, the props Askr wrote as DOM properties, mapped to the property
 * name. A property cannot be "removed" like an attribute, so this is what lets
 * an absent prop reset its property.
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
  if (Object.is(host[name], value)) return;
  host[name] = value;
}

/** Capture property and ownership state before a pass writes a DOM property. */
export function captureDomPropertyUndo(
  el: Element,
  key: string,
  value: unknown,
  tagName: string
): (() => void) | null {
  const name = getDomPropertyName(tagName, key, value);
  const written = writtenDomProperties.get(el);
  const previousName = written?.get(key);
  if (name === null && previousName === undefined) return null;

  const names = new Set<string>();
  if (name !== null && !BLOCKED_PROPERTY_NAMES.has(name)) names.add(name);
  if (previousName !== undefined) names.add(previousName);
  const host = el as PropertyHost;
  const properties = Array.from(names, (property) => ({
    property,
    descriptor: Object.getOwnPropertyDescriptor(host, property),
    value: host[property],
  }));
  const attributeNames = new Set<string>();
  for (const property of names) {
    attributeNames.add(getRenderedAttributeName(el, property));
  }
  if (!key.startsWith(PROPERTY_PROP_PREFIX)) {
    attributeNames.add(getRenderedAttributeName(el, key));
  }
  const attributes = Array.from(attributeNames, (attribute) => ({
    attribute,
    value: el.getAttribute(attribute),
  }));
  const hadWrittenMap = written !== undefined;
  const writtenBefore = written ? new Map(written) : null;

  return () => {
    const failures: unknown[] = [];
    for (const { property, descriptor, value: before } of properties) {
      try {
        if (descriptor && 'value' in descriptor) {
          Object.defineProperty(host, property, descriptor);
          continue;
        }
        if (!Reflect.set(host, property, before)) {
          throw new TypeError(`Could not restore DOM property ${property}`);
        }
        if (descriptor) Object.defineProperty(host, property, descriptor);
        else delete host[property];
      } catch (error) {
        failures.push(error);
      }
    }
    for (const { attribute, value: before } of attributes) {
      try {
        if (before === null) el.removeAttribute(attribute);
        else el.setAttribute(attribute, before);
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      if (hadWrittenMap) {
        writtenDomProperties.set(el, new Map(writtenBefore));
      } else {
        writtenDomProperties.delete(el);
      }
    } catch (error) {
      failures.push(error);
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1)
      throw new AggregateError(failures, 'DOM property rollback failed');
  };
}

export function hasDomPropertyWrite(
  el: Element,
  key: string,
  value: unknown,
  tagName: string
): boolean {
  return (
    getDomPropertyName(tagName, key, value) !== null ||
    writtenDomProperties.get(el)?.has(key) === true
  );
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

  if (value === null || value === undefined) {
    forgetProperty(el, key);
    return true;
  }

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
