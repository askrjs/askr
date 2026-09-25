import { sanitizeCssValue } from '../../common/css';
import {
  booleanAttributeValue,
  keepsFalseValue,
  normalizeStylePropertyName,
  styleValueText,
} from '../../common/prop-classification';
import { isUnsafeUrlAttribute } from '../../common/url';
import {
  ATTRIBUTE_PROP_PREFIX,
  isPropertyOnlyProp,
  matchesDomPropertyProp,
  propertyReflectsAttribute,
} from '../../common/dom-properties';
import { isDevelopmentEnvironment } from '../../common/env';
import { logger } from '../../common/logger';
import { incrementPerfMetric } from '../../runtime';
import { setRef } from '../../foundations/utilities/compose-ref';
import type { ReactivePropCleanupEntry } from '../ownership/cleanup';
import {
  extractKey,
  getRenderedAttributeName,
  isSkippedProp,
  parseEventName,
  readElementClassName,
  removeRenderedAttribute,
  setRenderedAttribute,
  tagNamesEqualIgnoreCase,
  writeAttribute,
  writeElementClassName,
} from '../utils';
import { applyDomPropertyProp, hasStaleDomProperties } from './properties';

/** Props whose live DOM property must be synced alongside the attribute. */
export function isFormControlProp(key: string): boolean {
  return key === 'value' || key === 'checked' || key === 'selected';
}

/**
 * Attributes the renderer never writes: unsafe URLs, and inline event handler
 * attributes requested through the `attr:` escape hatch (SSR skips those too).
 */
function isBlockedAttribute(key: string, value: unknown): boolean {
  if (key.startsWith(ATTRIBUTE_PROP_PREFIX)) {
    const name = key.slice(ATTRIBUTE_PROP_PREFIX.length);
    // `attr:` renders text; SSR skips objects too, so both sides agree.
    return (
      (value !== null && typeof value === 'object') ||
      name.slice(0, 2).toLowerCase() === 'on' ||
      isUnsafeUrlAttribute(name, value)
    );
  }
  return isUnsafeUrlAttribute(key, value);
}

/** Attribute text for a scalar prop, rendering HTML booleans bare. */
function renderedScalarValue(el: Element, key: string, value: unknown): string {
  return value === true
    ? booleanAttributeValue(getRenderedAttributeName(el, key))
    : String(value);
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

type Ref<T> =
  | ((value: T | null) => void)
  | { current: T | null }
  | null
  | undefined;

export function applyRef<T>(el: T, ref: unknown): void {
  const resolvedRef = ref as Ref<T>;
  setRef(resolvedRef, el);
}

/**
 * What Askr last applied to each element: the rendered prop values, keyed by
 * prop name. Reconciliation diffs against this baseline rather than the live
 * DOM, so attributes, class tokens and style properties written by other code
 * survive re-renders. Children, keys, refs and event handlers are not
 * recorded, and reactive bindings are recorded as a marker, so the record does
 * not retain vnode trees or closures.
 */
export type AppliedProps = Readonly<Record<string, unknown>>;

const appliedProps = new WeakMap<Element, AppliedProps>();

/** Stands in for a reactive (function) prop value in the applied record. */
const REACTIVE_APPLIED_VALUE = Object.freeze({});

/** @internal Record the props Askr has just applied to `el`. */
export function recordAppliedProps(
  el: Element,
  props: Record<string, unknown>
): void {
  const record: Record<string, unknown> = {};
  for (const key in props) {
    if (
      isSkippedProp(key) ||
      key === 'dangerouslySetInnerHTML' ||
      parseEventName(key)
    ) {
      continue;
    }
    const value = props[key];
    // Property-only props own no attribute, so there is nothing to remove.
    if (isPropertyOnlyProp(el.localName, key, value)) continue;
    if (isRenderedPropValue(key, value)) {
      record[key] =
        typeof value === 'function' ? REACTIVE_APPLIED_VALUE : value;
    }
  }
  appliedProps.set(el, record);
}

/**
 * @internal The props Askr last applied to `el`, or `undefined` when the
 * element was never reconciled by Askr (for example server-rendered markup).
 */
export function getAppliedProps(el: Element): AppliedProps | undefined {
  return appliedProps.get(el);
}

/** @internal Put back a record captured with `getAppliedProps` (rollback). */
export function restoreAppliedProps(
  el: Element,
  record: AppliedProps | undefined
): void {
  if (record === undefined) {
    appliedProps.delete(el);
  } else {
    appliedProps.set(el, record);
  }
}

/** Whether a prop value renders anything into the DOM. */
export function isRenderedPropValue(key: string, value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    (value !== false || keepsFalseValue(key))
  );
}

/**
 * @internal The value Askr last applied for `key`, as a diff baseline:
 * `null` when nothing was rendered, `undefined` when unknown (no record, or a
 * reactive binding that has not committed yet). For a reactive binding the
 * value is read from the binding itself.
 */
export function getPreviousAppliedValue(
  previousProps: AppliedProps | undefined,
  key: string,
  reactiveProps?: ReadonlyMap<string, ReactivePropCleanupEntry>
): unknown {
  if (previousProps === undefined) return undefined;
  const isClass = key === 'class' || key === 'className';
  const value = isClass
    ? (previousProps.class ?? previousProps.className)
    : previousProps[key];
  if (value !== REACTIVE_APPLIED_VALUE) return value ?? null;
  const binding = isClass
    ? (reactiveProps?.get('class') ?? reactiveProps?.get('className'))
    : reactiveProps?.get(key);
  return binding?.readAppliedValue?.();
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
    incrementPerfMetric('skippedDomPropWrites');
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
    } else if (isBlockedAttribute(key, value)) {
      removeRenderedAttribute(el, key);
    } else {
      setRenderedAttribute(el, key, renderedScalarValue(el, key, value));
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
          incrementPerfMetric('classListPatchOps');
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
  if (
    !descriptor &&
    nextString.length > 0 &&
    readElementClassName(el) === nextString
  ) {
    incrementPerfMetric('skippedDomPropWrites');
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
        incrementPerfMetric('classListPatchOps');
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
  } else if (isBlockedAttribute(key, value)) {
    removeRenderedAttribute(el, key);
  } else {
    const attributeName = getRenderedAttributeName(el, key);
    const nextValue =
      value === true ? booleanAttributeValue(attributeName) : String(value);
    if (el.getAttribute(attributeName) === nextValue) {
      incrementPerfMetric('skippedDomPropWrites');
      return;
    }
    writeAttribute(el, attributeName, nextValue);
  }
}

/** Whether any prop in `props` renders the attribute `attributeName`. */
function rendersAttribute(
  el: Element,
  props: Record<string, unknown>,
  attributeName: string
): boolean {
  for (const propName in props) {
    if (
      !isSkippedProp(propName) &&
      !parseEventName(propName) &&
      isRenderedPropValue(propName, props[propName]) &&
      getRenderedAttributeName(el, propName) === attributeName
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Remove what Askr rendered for props that are absent from `props`.
 *
 * With `previousProps` (the props Askr last applied) only attributes, class
 * tokens and style properties Askr wrote are removed; anything other code
 * added is preserved. Props still present in `props` are reconciled by the
 * caller. Without a record (markup Askr did not create, such as SSR output
 * being adopted) every attribute not in `props` is treated as stale.
 */
export function removeStaleAttributes(
  el: Element,
  vnode: unknown,
  props: Record<string, unknown>,
  previousProps?: AppliedProps,
  reactiveProps?: ReadonlyMap<string, ReactivePropCleanupEntry>
): void {
  if (previousProps !== undefined) {
    removeStaleOwnedProps(el, vnode, props, previousProps, reactiveProps);
    return;
  }

  const desiredAttributes: string[] = [];
  const key = extractKey(vnode);

  if (key !== undefined) {
    desiredAttributes.push('data-key', 'data-askr-key-kind');
  }

  for (const propName in props) {
    if (isSkippedProp(propName)) continue;
    if (parseEventName(propName)) continue;

    const value = props[propName];
    if (
      value === undefined ||
      value === null ||
      (value === false && !keepsFalseValue(propName))
    )
      continue;

    desiredAttributes.push(getRenderedAttributeName(el, propName));
  }

  // Most intrinsic nodes have only a few attributes. Keep their lookup inline;
  // larger prop sets retain bounded lookup cost through a hash set.
  const desiredAttributeSet =
    desiredAttributes.length > 8 ? new Set(desiredAttributes) : undefined;
  // Snapshot the original Attr objects before callbacks can mutate the live
  // collection. Indexed access avoids the DOM iterator's per-entry objects.
  const attributes = el.attributes;
  const retained: Attr[] = [];
  for (
    let index = 0, attribute = attributes.item(0);
    attribute;
    attribute = attributes.item(++index)
  ) {
    retained.push(attribute);
  }
  for (const attribute of retained) {
    const attributeName = getRenderedAttributeName(el, attribute.name);
    if (
      !(desiredAttributeSet
        ? desiredAttributeSet.has(attributeName)
        : desiredAttributes.includes(attributeName))
    ) {
      removeRenderedAttribute(el, attribute.name);
    }
  }
}

function removeStaleOwnedProps(
  el: Element,
  vnode: unknown,
  props: Record<string, unknown>,
  previousProps: AppliedProps,
  reactiveProps: ReadonlyMap<string, ReactivePropCleanupEntry> | undefined
): void {
  if (extractKey(vnode) === undefined) {
    if (el.hasAttribute('data-key')) el.removeAttribute('data-key');
    if (el.hasAttribute('data-askr-key-kind')) {
      el.removeAttribute('data-askr-key-kind');
    }
  }

  // The record only holds rendered, attribute-bearing props.
  for (const propName in previousProps) {
    if (propName in props) continue;

    if (propName === 'class' || propName === 'className') {
      if (!('class' in props) && !('className' in props)) {
        applyScalarPropValue(
          el,
          'class',
          null,
          el.localName,
          getPreviousAppliedValue(previousProps, propName, reactiveProps)
        );
      }
    } else if (propName === 'style') {
      applyStylePropValue(
        el,
        null,
        getPreviousAppliedValue(previousProps, propName, reactiveProps)
      );
    } else {
      const attributeName = getRenderedAttributeName(el, propName);
      if (!rendersAttribute(el, props, attributeName)) {
        el.removeAttribute(attributeName);
      }
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

    const propertyMatch = matchesDomPropertyProp(el, key, value, vnodeType);
    if (propertyMatch === false) {
      return false;
    }
    if (propertyMatch === true && !propertyReflectsAttribute(key)) {
      continue;
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

  return (
    el.attributes.length === staticPropCount &&
    !hasStaleDomProperties(el, props)
  );
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
