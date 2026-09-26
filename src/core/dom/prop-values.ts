/**
 * How a scalar prop value is written to an element: class tokens, owned style
 * properties, form state, DOM properties, URL-guarded attributes, and the
 * `attr:`/`prop:` escape hatches. Shared semantics with SSR attribute
 * serialization; the renderer decides when these run.
 */

import { sanitizeCssValue } from '../../common/css';
import {
  booleanAttributeValue,
  isSkippedProp,
  keepsFalseValue,
  normalizeStylePropertyName,
  styleValueText,
} from '../../common/prop-classification';
import { rejectUnsafeUrlAttribute } from '../../common/url';
import { ATTRIBUTE_PROP_PREFIX } from '../../common/dom-properties';
import { isDevelopmentEnvironment } from '../../common/env';
import { logger } from '../../common/logger';
import {
  getRenderedAttributeName,
  readElementClassName,
  removeRenderedAttribute,
  setRenderedAttribute,
  tagNamesEqualIgnoreCase,
  writeAttribute,
  writeElementClassName,
} from './element-attributes';
import { applyDomPropertyProp } from './dom-properties';

/** Props whose live DOM property must be synced alongside the attribute. */
export function isFormControlProp(key: string): boolean {
  return key === 'value' || key === 'checked' || key === 'selected';
}

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

export function isDangerousInnerHTMLPayload(
  value: unknown
): value is { __html: unknown } {
  return (
    value !== null && typeof value === 'object' && '__html' in (value as object)
  );
}

function applyDangerousInnerHTMLValue(el: Element, value: unknown): void {
  if (!isDangerousInnerHTMLPayload(value)) {
    return;
  }

  if (isDevelopmentEnvironment()) {
    logger.warn(
      '[Askr] dangerouslySetInnerHTML is being used, which bypasses the ' +
        "framework's normal rendering and can introduce XSS vulnerabilities " +
        'if the HTML is derived from untrusted input. Make sure the value is ' +
        'sanitized.'
    );
  }

  const html = value.__html;
  el.innerHTML = html === null || html === undefined ? '' : String(html);
}

type ClassTokenDescriptor = {
  lastClassTokens: string[] | null;
};

type StyleEntries = Map<string, string>;

export function applyFormControlProp(
  el: Element,
  key: string,
  value: unknown,
  tagName: string
): void {
  if (key === 'value') {
    const stringValue = String(value);
    if (tagNamesEqualIgnoreCase(tagName, 'select')) {
      const select = el as HTMLSelectElement;
      if (select.multiple && Array.isArray(value)) {
        const selectedValues = new Set(value.map(String));
        for (const option of Array.from(select.options)) {
          const selected = selectedValues.has(option.value);
          if (option.selected !== selected) {
            option.selected = selected;
          }
        }
      } else if (select.value !== stringValue) {
        select.value = stringValue;
      }
    } else if (
      tagNamesEqualIgnoreCase(tagName, 'input') ||
      tagNamesEqualIgnoreCase(tagName, 'textarea')
    ) {
      const control = el as HTMLInputElement | HTMLTextAreaElement;
      if (control.value !== stringValue) {
        control.value = stringValue;
      }
    }

    if (el.getAttribute('value') !== stringValue) {
      el.setAttribute('value', stringValue);
    }
    return;
  }

  if (key === 'selected') {
    // Mirrors `checked`: the property is the live selection state, the
    // attribute is what SSR emits and what hydration compares against.
    const selected = Boolean(value);
    if (tagNamesEqualIgnoreCase(tagName, 'option')) {
      const option = el as HTMLOptionElement;
      if (option.selected !== selected) {
        option.selected = selected;
      }
    }
    if (selected) {
      if (!el.hasAttribute('selected')) {
        el.setAttribute('selected', '');
      }
    } else if (el.hasAttribute('selected')) {
      el.removeAttribute('selected');
    }
    return;
  }

  if (key === 'checked') {
    if (tagNamesEqualIgnoreCase(tagName, 'input')) {
      const checked = Boolean(value);
      const input = el as HTMLInputElement;
      if (input.checked !== checked) {
        input.checked = checked;
      }
      if (checked) {
        if (!el.hasAttribute('checked')) {
          el.setAttribute('checked', '');
        }
      } else {
        if (el.hasAttribute('checked')) {
          el.removeAttribute('checked');
        }
      }
    } else if (value) {
      if (!el.hasAttribute('checked')) {
        el.setAttribute('checked', '');
      }
    } else {
      if (el.hasAttribute('checked')) {
        el.removeAttribute('checked');
      }
    }
  }
}

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

const EMPTY_CLASS_TOKENS: string[] = [];

/** Class tokens Askr last applied; `null` means unknown. */
function previousClassTokens(previousValue: unknown): string[] | null {
  return previousValue === null || previousValue === false
    ? EMPTY_CLASS_TOKENS
    : tokenizeClassValue(previousValue);
}

function tokenizeClassValue(value: unknown): string[] | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return [];
  }

  return trimmed.split(/\s+/);
}

function patchClassList(
  el: Element,
  previousTokens: string[],
  nextTokens: string[]
): void {
  if (previousTokens.length === nextTokens.length) {
    let identical = true;
    for (let index = 0; index < previousTokens.length; index += 1) {
      if (previousTokens[index] !== nextTokens[index]) {
        identical = false;
        break;
      }
    }
    if (identical) {
      // Nothing changed since the last apply; restore any owned token that
      // other code removed without touching tokens it added.
      for (const token of nextTokens) {
        if (!el.classList.contains(token)) {
          el.classList.add(token);
        }
      }
      return;
    }
  }

  if (previousTokens.length === 0) {
    if (nextTokens.length === 0) {
      return;
    }
    el.classList.add(...nextTokens);
    return;
  }

  if (nextTokens.length === 0) {
    el.classList.remove(...previousTokens);
    return;
  }

  if (previousTokens.length === 1 && nextTokens.length === 1) {
    el.classList.remove(previousTokens[0]);
    el.classList.add(nextTokens[0]);
    return;
  }

  const nextSet = new Set(nextTokens);
  const previousSet = new Set(previousTokens);

  for (const token of previousTokens) {
    if (!nextSet.has(token)) {
      el.classList.remove(token);
    }
  }

  for (const token of nextTokens) {
    if (!previousSet.has(token)) {
      el.classList.add(token);
    }
  }
}

export function applyClassPropValue(
  el: Element,
  value: unknown,
  previousValue: unknown,
  descriptor?: ClassTokenDescriptor
): void {
  const nextString = String(value);
  if (
    !descriptor &&
    nextString.length > 0 &&
    readElementClassName(el) === nextString
  ) {
    return;
  }
  const nextTokens = tokenizeClassValue(nextString);
  const previousTokens =
    descriptor?.lastClassTokens ?? previousClassTokens(previousValue);

  if (nextTokens && previousTokens) {
    patchClassList(el, previousTokens, nextTokens);
    if (descriptor) {
      descriptor.lastClassTokens = nextTokens;
    }
    return;
  }

  writeElementClassName(el, nextString);
  if (descriptor) {
    descriptor.lastClassTokens = nextTokens;
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
