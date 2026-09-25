/**
 * Which JSX props are written to DOM properties instead of attributes.
 *
 * Attributes are the default because SSR can serialize them and hydration can
 * compare them. Some element state only lives in a property, though: the
 * `muted` attribute is only the initial value of `media.muted`, `indeterminate`
 * has no attribute at all, and custom elements take objects and arrays as
 * properties. Both renderers classify props here so the DOM renderer writes
 * the property and SSR leaves out whatever it cannot serialize.
 *
 * - `prop:name` always assigns `el.name`, verbatim, and never renders.
 * - `attr:name` always renders the `name` attribute (see attr-names.ts).
 */

import { isCustomElementName } from './attr-names';

export const PROPERTY_PROP_PREFIX = 'prop:';
export const ATTRIBUTE_PROP_PREFIX = 'attr:';

/**
 * Known properties the attribute does not keep in sync, on the elements that
 * have them. Their value is coerced to a boolean and an absent prop resets
 * them to `false`. `muted` also keeps its attribute, which SSR renders and
 * which sets the initial state on parse; `indeterminate` has no attribute and
 * never renders.
 */
function isKnownPropertyOf(tagName: string, key: string): boolean {
  if (key === 'muted') {
    const tag = tagName.toLowerCase();
    return tag === 'video' || tag === 'audio';
  }
  return key === 'indeterminate' && tagName.toLowerCase() === 'input';
}

export function isKnownBooleanProperty(key: string): boolean {
  return key === 'muted' || key === 'indeterminate';
}

/**
 * The DOM property a prop is written to, or `null` when it is an attribute.
 *
 * Custom elements (a tag name containing `-`) receive object and array values
 * as properties; their primitive values stay attributes.
 */
export function getDomPropertyName(
  tagName: string,
  key: string,
  value: unknown
): string | null {
  if (key.startsWith(PROPERTY_PROP_PREFIX)) {
    return key.slice(PROPERTY_PROP_PREFIX.length);
  }

  if (isKnownPropertyOf(tagName, key)) {
    return key;
  }

  if (
    value !== null &&
    typeof value === 'object' &&
    key !== 'style' &&
    key !== 'dangerouslySetInnerHTML' &&
    isCustomElementName(tagName)
  ) {
    return key;
  }

  return null;
}

/** Whether a property-routed prop also renders its attribute (`muted`). */
export function propertyReflectsAttribute(key: string): boolean {
  return key === 'muted';
}

/**
 * Whether SSR leaves a prop out entirely because it is written only as a
 * property on the client.
 */
export function isPropertyOnlyProp(
  tagName: string,
  key: string,
  value: unknown
): boolean {
  return (
    getDomPropertyName(tagName, key, value) !== null &&
    !propertyReflectsAttribute(key)
  );
}
