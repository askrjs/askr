import { sanitizeCssValue } from '../common/css';
import { isUnsafeUrlAttribute } from '../common/url';
import { isDevelopmentEnvironment } from '../common/env';
import { logger } from '../common/logger';
import { incrementPerfMetric } from '../runtime';
import { setRef } from '../foundations/utilities/compose-ref';
import {
  extractKey,
  getRenderedAttributeName,
  isSkippedProp,
  parseEventName,
  readElementClassName,
  removeRenderedAttribute,
  setRenderedAttribute,
  tagNamesEqualIgnoreCase,
  writeElementClassName,
} from './utils';

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

function isAriaAttribute(key: string): boolean {
  return key.length > 5 && key.slice(0, 5).toLowerCase() === 'aria-';
}

type Ref<T> =
  | ((value: T | null) => void)
  | { current: T | null }
  | null
  | undefined;

export function applyRef<T>(el: T, ref: unknown): void {
  const resolvedRef = ref as Ref<T>;
  setRef(resolvedRef, el);
}

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

function normalizeStylePropertyName(propertyName: string): string {
  if (propertyName.startsWith('--')) {
    return propertyName;
  }

  return propertyName.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function collectCurrentStyleEntries(el: Element): StyleEntries {
  const entries: StyleEntries = new Map();
  const style = (el as HTMLElement | SVGElement).style;

  if (!style) {
    return entries;
  }

  for (let index = 0; index < style.length; index += 1) {
    const propertyName = style.item(index);
    entries.set(propertyName, style.getPropertyValue(propertyName));
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

    const safeValue = sanitizeCssValue(String(entryValue));
    if (safeValue) {
      entries.set(normalizeStylePropertyName(key), safeValue);
    }
  }

  return entries;
}

export function applyStylePropValue(el: Element, value: unknown): void {
  const style = (el as HTMLElement | SVGElement).style;
  if (!style) {
    if (value === null || value === undefined || value === false) {
      el.removeAttribute('style');
      return;
    }

    el.setAttribute('style', String(value));
    return;
  }

  if (value === null || value === undefined || value === false) {
    if (!el.getAttribute('style')) {
      incrementPerfMetric('skippedDomPropWrites');
      return;
    }

    style.cssText = '';
    el.removeAttribute('style');
    return;
  }

  if (typeof value === 'string') {
    if ((el.getAttribute('style') ?? '') === value) {
      incrementPerfMetric('skippedDomPropWrites');
      return;
    }

    style.cssText = value;
    return;
  }

  const nextEntries = normalizeStyleEntries(value);
  if (!nextEntries) {
    const nextText = String(value);
    if ((el.getAttribute('style') ?? '') === nextText) {
      incrementPerfMetric('skippedDomPropWrites');
      return;
    }

    style.cssText = nextText;
    return;
  }

  const previousEntries = collectCurrentStyleEntries(el);
  let didWrite = false;

  for (const [propertyName] of previousEntries) {
    if (nextEntries.has(propertyName)) {
      continue;
    }

    style.removeProperty(propertyName);
    didWrite = true;
  }

  for (const [propertyName, propertyValue] of nextEntries) {
    if (previousEntries.get(propertyName) === propertyValue) {
      continue;
    }

    style.setProperty(propertyName, propertyValue);
    didWrite = true;
  }

  if (!didWrite) {
    incrementPerfMetric('skippedDomPropWrites');
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
    if (
      value === undefined ||
      value === null ||
      (value === false && !isAriaAttribute(key))
    ) {
      continue;
    }

    if (key === 'class' || key === 'className') {
      writeElementClassName(el, String(value));
    } else if (key === 'style') {
      applyStylePropValue(el, value);
    } else if (key === 'value' || key === 'checked') {
      applyFormControlProp(el, key, value, tagName);
    } else if (key === 'dangerouslySetInnerHTML') {
      applyDangerousInnerHTMLValue(el, value);
    } else if (isUnsafeUrlAttribute(key, value)) {
      removeRenderedAttribute(el, key);
    } else {
      setRenderedAttribute(el, key, String(value));
    }
  }
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
      return;
    }
  }

  if (previousTokens.length === 0) {
    if (nextTokens.length === 0) {
      return;
    }
    el.classList.add(...nextTokens);
    incrementPerfMetric('classListPatchOps');
    return;
  }

  if (nextTokens.length === 0) {
    el.classList.remove(...previousTokens);
    incrementPerfMetric('classListPatchOps');
    return;
  }

  if (previousTokens.length === 1 && nextTokens.length === 1) {
    el.classList.remove(previousTokens[0]);
    el.classList.add(nextTokens[0]);
    incrementPerfMetric('classListPatchOps');
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

  incrementPerfMetric('classListPatchOps');
}

export function applyClassPropValue(
  el: Element,
  value: unknown,
  previousValue: unknown,
  descriptor?: ClassTokenDescriptor
): void {
  const nextString = String(value);
  const nextTokens = tokenizeClassValue(nextString);
  const previousTokens =
    descriptor?.lastClassTokens ?? tokenizeClassValue(previousValue);

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

  if (
    value === undefined ||
    value === null ||
    (value === false && !isAriaAttribute(key))
  ) {
    if (key === 'class' || key === 'className') {
      const previousTokens = descriptor?.lastClassTokens;
      if (previousTokens && previousTokens.length > 0) {
        el.classList.remove(...previousTokens);
        incrementPerfMetric('classListPatchOps');
      } else {
        writeElementClassName(el, '');
      }
      if (descriptor) {
        descriptor.lastClassTokens = [];
      }
    } else if (key === 'value') {
      applyFormControlProp(el, key, '', tagName);
    } else if (key === 'checked') {
      applyFormControlProp(el, key, false, tagName);
    } else if (key === 'style') {
      applyStylePropValue(el, null);
    } else {
      removeRenderedAttribute(el, key);
    }
    return;
  }

  if (key === 'class' || key === 'className') {
    applyClassPropValue(el, value, previousValue, descriptor);
  } else if (key === 'style') {
    applyStylePropValue(el, value);
  } else if (key === 'value' || key === 'checked') {
    applyFormControlProp(el, key, value, tagName);
  } else if (key === 'dangerouslySetInnerHTML') {
    applyDangerousInnerHTMLValue(el, value);
  } else if (isUnsafeUrlAttribute(key, value)) {
    removeRenderedAttribute(el, key);
  } else {
    setRenderedAttribute(el, key, String(value));
  }
}

export function removeStaleAttributes(
  el: Element,
  vnode: unknown,
  props: Record<string, unknown>
): void {
  const desiredAttributes = new Set<string>();
  const key = extractKey(vnode);

  if (key !== undefined) {
    desiredAttributes.add('data-key');
    desiredAttributes.add('data-askr-key-kind');
  }

  for (const propName in props) {
    if (isSkippedProp(propName)) continue;
    if (parseEventName(propName)) continue;

    const value = props[propName];
    if (
      value === undefined ||
      value === null ||
      (value === false && !isAriaAttribute(propName))
    )
      continue;

    desiredAttributes.add(getRenderedAttributeName(el, propName));
  }

  for (const attribute of Array.from(el.attributes)) {
    if (!desiredAttributes.has(getRenderedAttributeName(el, attribute.name))) {
      removeRenderedAttribute(el, attribute.name);
    }
  }
}

export function materializeKey(
  el: Element,
  vnode: { key?: unknown },
  props: Record<string, unknown>
): void {
  const rawKey = vnode.key ?? props.key;
  const vnodeKey =
    rawKey === null || rawKey === undefined
      ? undefined
      : typeof rawKey === 'symbol'
        ? String(rawKey)
        : (rawKey as string | number);
  if (vnodeKey !== undefined) {
    const nextKey = String(vnodeKey);
    if (el.getAttribute('data-key') !== nextKey) {
      el.setAttribute('data-key', nextKey);
    }
    const keyKind = typeof vnodeKey;
    if (el.getAttribute('data-askr-key-kind') !== keyKind) {
      el.setAttribute('data-askr-key-kind', keyKind);
    }
  }
}

/** @internal Materialize keyed metadata on a newly created or cloned node. */
export function materializeFreshKey(
  el: Element,
  vnode: { key?: unknown },
  props: Record<string, unknown>
): void {
  const rawKey = vnode.key ?? props.key;
  if (rawKey === null || rawKey === undefined) {
    return;
  }

  const vnodeKey = typeof rawKey === 'symbol' ? String(rawKey) : rawKey;
  el.setAttribute('data-key', String(vnodeKey));
  const keyKind = typeof vnodeKey;
  if (el.getAttribute('data-askr-key-kind') !== keyKind) {
    el.setAttribute('data-askr-key-kind', keyKind);
  }
}

function hasMatchingStaticPropsInternal(
  el: Element,
  props: Record<string, unknown>,
  vnodeType: string,
  ignoreEventProps: boolean
): boolean {
  let staticPropCount = 0;

  for (const key in props) {
    if (isSkippedProp(key)) continue;

    const value = props[key];
    if (value === undefined || value === null || value === false) {
      return false;
    }

    const eventName = parseEventName(key);
    if (eventName) {
      if (ignoreEventProps) continue;
      return false;
    }
    if (typeof value === 'function') {
      return false;
    }

    if (key === 'class' || key === 'className') {
      if (readElementClassName(el) !== String(value)) {
        return false;
      }
      staticPropCount += 1;
      continue;
    }

    if (key === 'style') {
      const styleValue =
        typeof value === 'string' ? value.trim().replace(/;$/, '') : null;
      const domStyle = el.getAttribute('style')?.trim().replace(/;$/, '') ?? '';
      if (styleValue === null || domStyle !== styleValue) {
        return false;
      }
      staticPropCount += 1;
      continue;
    }

    if (key === 'value') {
      const stringValue = String(value);
      if (
        tagNamesEqualIgnoreCase(vnodeType, 'select') &&
        (el as HTMLSelectElement).multiple &&
        Array.isArray(value)
      ) {
        const selectedValues = new Set(value.map(String));
        for (const option of Array.from((el as HTMLSelectElement).options)) {
          if (option.selected !== selectedValues.has(option.value)) {
            return false;
          }
        }
      } else if (
        (el as HTMLElement & { value?: string }).value !== stringValue
      ) {
        return false;
      }
      if (el.getAttribute('value') !== stringValue) {
        return false;
      }
      staticPropCount += 1;
      continue;
    }

    if (key === 'checked') {
      if (
        (el as HTMLElement & { checked?: boolean }).checked !== Boolean(value)
      ) {
        return false;
      }
      if (Boolean(value) !== el.hasAttribute('checked')) {
        return false;
      }
      staticPropCount += 1;
      continue;
    }

    if (key === 'selected' && vnodeType === 'option') {
      if ((el as HTMLOptionElement).selected !== Boolean(value)) {
        return false;
      }
      staticPropCount += 1;
      continue;
    }

    if (el.getAttribute(getRenderedAttributeName(el, key)) !== String(value)) {
      return false;
    }

    staticPropCount += 1;
  }

  return el.attributes.length === staticPropCount;
}

export function hasMatchingStaticProps(
  el: Element,
  props: Record<string, unknown>,
  vnodeType: string
): boolean {
  return hasMatchingStaticPropsInternal(el, props, vnodeType, false);
}

export function hasMatchingStaticPropsIgnoringEvents(
  el: Element,
  props: Record<string, unknown>,
  vnodeType: string
): boolean {
  return hasMatchingStaticPropsInternal(el, props, vnodeType, true);
}
