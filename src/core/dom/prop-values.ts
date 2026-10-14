/** Scalar dispatch chooses private value writers; the renderer owns write timing. */
import {
  booleanAttributeValue,
  isSkippedProp,
  keepsFalseValue,
} from '../../common/prop-classification';
import { rejectUnsafeUrlAttribute } from '../../common/url';
import { ATTRIBUTE_PROP_PREFIX } from '../../common/dom-properties';
import {
  getRenderedAttributeName,
  removeRenderedAttribute,
  setRenderedAttribute,
  writeAttribute,
  writeElementClassName,
} from './element-attributes';
import { applyDomPropertyProp } from './dom-properties';
import { applyFormControlProp, isFormControlProp } from './prop-value-form';
import {
  applyDangerousInnerHTMLValue,
  isDangerousInnerHTMLPayload,
} from './prop-value-html';
import { applyStylePropValue } from './prop-value-style';
import {
  applyClassPropValue,
  previousClassTokens,
  dropEmptySvgClass,
  type ClassTokenDescriptor,
} from './prop-value-class';

export { applyFormControlProp, isFormControlProp } from './prop-value-form';
export { isDangerousInnerHTMLPayload } from './prop-value-html';
export { applyStylePropValue } from './prop-value-style';
export { applyClassPropValue } from './prop-value-class';

/** Attribute text for a scalar prop, rendering HTML booleans bare. */
function renderedScalarValue(el: Element, key: string, value: unknown): string {
  return value === true
    ? booleanAttributeValue(getRenderedAttributeName(el, key))
    : String(value);
}

/**
 * The text to write for a scalar attribute prop, or `null` when the renderer
 * never writes it: unsafe URLs, and inline event handler or object values
 * requested through the `attr:` escape hatch (SSR skips those too). The value
 * is converted once, and the checked text is the text written, so a
 * `toString()` cannot pass the URL check and then return something else.
 */
function renderableAttributeText(
  el: Element,
  key: string,
  value: unknown
): string | null {
  let name = key;
  if (key.startsWith(ATTRIBUTE_PROP_PREFIX)) {
    name = key.slice(ATTRIBUTE_PROP_PREFIX.length);
    // `attr:` renders text; SSR skips objects too, so both sides agree.
    if (
      (value !== null && typeof value === 'object') ||
      name.slice(0, 2).toLowerCase() === 'on'
    ) {
      return null;
    }
  }
  const text = renderedScalarValue(el, key, value);
  return rejectUnsafeUrlAttribute(name, text) ? null : text;
}

export function applyStaticScalarPropsToElement(
  el: Element,
  props: Record<string, unknown>,
  tagName: string
): void {
  for (const key in props) {
    if (isSkippedProp(key)) {
      continue;
    }

    const value = props[key];
    if (applyDomPropertyProp(el, key, value, tagName)) {
      continue;
    }
    if (
      value === undefined ||
      value === null ||
      (value === false && !keepsFalseValue(key))
    ) {
      continue;
    }

    if (key === 'class' || key === 'className') {
      writeElementClassName(el, String(value));
    } else if (key === 'style') {
      applyStylePropValue(el, value);
    } else if (isFormControlProp(key)) {
      applyFormControlProp(el, key, value, tagName);
    } else if (key === 'dangerouslySetInnerHTML') {
      applyDangerousInnerHTMLValue(el, value);
    } else {
      const text = renderableAttributeText(el, key, value);
      if (text === null) removeRenderedAttribute(el, key);
      else setRenderedAttribute(el, key, text);
    }
  }
}

export function applyScalarPropValue(
  el: Element,
  key: string,
  value: unknown,
  tagName: string,
  previousValue?: unknown,
  descriptor?: ClassTokenDescriptor
): void {
  if (
    key === 'dangerouslySetInnerHTML' &&
    !isDangerousInnerHTMLPayload(value)
  ) {
    return;
  }

  if (applyDomPropertyProp(el, key, value, tagName)) {
    return;
  }

  if (
    value === undefined ||
    value === null ||
    (value === false && !keepsFalseValue(key))
  ) {
    if (key === 'class' || key === 'className') {
      const previousTokens = descriptor
        ? descriptor.lastClassTokens
        : previousClassTokens(previousValue);
      if (previousTokens === null) {
        writeElementClassName(el, '');
      } else if (previousTokens.length > 0) {
        el.classList.remove(...previousTokens);
        dropEmptySvgClass(el);
      }
      if (descriptor) {
        descriptor.lastClassTokens = [];
      }
    } else if (key === 'value') {
      applyFormControlProp(el, key, '', tagName);
    } else if (key === 'checked' || key === 'selected') {
      applyFormControlProp(el, key, false, tagName);
    } else if (key === 'style') {
      applyStylePropValue(el, null, previousValue);
    } else {
      removeRenderedAttribute(el, key);
    }
    return;
  }

  if (key === 'class' || key === 'className') {
    applyClassPropValue(el, value, previousValue, descriptor);
  } else if (key === 'style') {
    applyStylePropValue(el, value, previousValue);
  } else if (isFormControlProp(key)) {
    applyFormControlProp(el, key, value, tagName);
  } else if (key === 'dangerouslySetInnerHTML') {
    applyDangerousInnerHTMLValue(el, value);
  } else {
    const nextValue = renderableAttributeText(el, key, value);
    if (nextValue === null) {
      removeRenderedAttribute(el, key);
      return;
    }
    const attributeName = getRenderedAttributeName(el, key);
    if (el.getAttribute(attributeName) === nextValue) {
      return;
    }
    writeAttribute(el, attributeName, nextValue);
  }
}
