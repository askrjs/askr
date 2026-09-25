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

/**
 * Per element, the props Askr last wrote as DOM properties, mapped to the
 * property name. Attributes are diffed against the DOM, but a property cannot
 * be "removed", so this is what lets an absent prop reset its property.
 */
const writtenDomProperties = new WeakMap<Element, Map<string, string>>();

type PropertyHost = Element & Record<string, unknown>;

function propertyValue(key: string, value: unknown): unknown {
  return isKnownBooleanProperty(key) ? Boolean(value) : value;
}

function resetValue(key: string): unknown {
  return isKnownBooleanProperty(key) ? false : undefined;
}

function isBlockedProperty(name: string, value: unknown): boolean {
  if (name === 'innerHTML' || name === 'outerHTML') {
    if (isDevelopmentEnvironment()) {
      logger.warn(
        `[Askr] ${PROPERTY_PROP_PREFIX}${name} is ignored. Use ` +
          'dangerouslySetInnerHTML to write raw HTML.'
      );
    }
    return true;
  }
  return typeof value === 'string' && isUnsafeUrlAttribute(name, value);
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
    if (!isCustomElementName(tagName)) return false;
    const written = writtenDomProperties.get(el);
    const previous = written?.get(key);
    if (previous !== undefined) {
      written!.delete(key);
      writeProperty(el, previous, resetValue(key));
    }
    return false;
  }

  const next = propertyValue(key, value);
  if (!isBlockedProperty(name, next)) {
    let written = writtenDomProperties.get(el);
    if (!written) {
      written = new Map();
      writtenDomProperties.set(el, written);
    }
    written.set(key, name);
    writeProperty(el, name, next);
  }
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
    writeProperty(el, name, resetValue(key));
  }
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
