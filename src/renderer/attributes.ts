import type { Props } from '../common/props';
import { incrementPerfMetric } from '../runtime/perf-metrics';
import {
  extractKey,
  isSkippedProp,
  parseEventName,
  tagNamesEqualIgnoreCase,
  writeElementClassName,
} from './utils';

type ClassTokenDescriptor = {
  lastClassTokens: string[] | null;
};

type Ref<T> =
  | ((value: T | null) => void)
  | { current: T | null }
  | null
  | undefined;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function applyRef<T>(el: T, ref: unknown): void {
  const resolvedRef = ref as Ref<T>;
  if (!resolvedRef) return;
  if (typeof resolvedRef === 'function') {
    resolvedRef(el);
    return;
  }

  if (Object.isExtensible(resolvedRef)) {
    (resolvedRef as { current: T | null }).current = el;
  }
}

export function applyFormControlProp(
  el: Element,
  key: string,
  value: unknown,
  tagName: string
): void {
  if (key === 'value') {
    if (
      tagNamesEqualIgnoreCase(tagName, 'input') ||
      tagNamesEqualIgnoreCase(tagName, 'textarea') ||
      tagNamesEqualIgnoreCase(tagName, 'select')
    ) {
      (el as HTMLInputElement & Props).value = String(value);
      el.setAttribute('value', String(value));
    } else {
      el.setAttribute('value', String(value));
    }
    return;
  }

  if (key === 'checked') {
    if (tagNamesEqualIgnoreCase(tagName, 'input')) {
      const checked = Boolean(value);
      (el as HTMLInputElement & Props).checked = checked;
      if (checked) {
        el.setAttribute('checked', '');
      } else {
        el.removeAttribute('checked');
      }
    } else if (value) {
      el.setAttribute('checked', '');
    } else {
      el.removeAttribute('checked');
    }
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
    if (value === undefined || value === null || value === false) {
      continue;
    }

    if (key === 'class' || key === 'className') {
      writeElementClassName(el, String(value));
    } else if (key === 'value' || key === 'checked') {
      applyFormControlProp(el, key, value, tagName);
    } else {
      el.setAttribute(key, String(value));
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

function getRenderedAttributeName(el: Element, propName: string): string {
  let attributeName = propName;
  if (propName === 'className') {
    attributeName = 'class';
  } else if (propName === 'htmlFor') {
    attributeName = 'for';
  }

  return el.namespaceURI === SVG_NAMESPACE
    ? attributeName
    : attributeName.toLowerCase();
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
  }

  for (const propName in props) {
    if (isSkippedProp(propName)) continue;
    if (parseEventName(propName)) continue;

    const value = props[propName];
    if (value === undefined || value === null || value === false) continue;

    desiredAttributes.add(getRenderedAttributeName(el, propName));
  }

  for (const attribute of Array.from(el.attributes)) {
    if (!desiredAttributes.has(getRenderedAttributeName(el, attribute.name))) {
      el.removeAttribute(attribute.name);
    }
  }
}
