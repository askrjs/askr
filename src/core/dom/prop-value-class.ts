/** Class token ownership preserves classes installed by other code. */
import {
  isSVGDomElement,
  readElementClassName,
  writeElementClassName,
} from './element-attributes';

export type ClassTokenDescriptor = {
  lastClassTokens: string[] | null;
};

const EMPTY_CLASS_TOKENS: string[] = [];

/** Class tokens Askr last applied; `null` means unknown. */
export function previousClassTokens(previousValue: unknown): string[] | null {
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
    if (Object.is(value, previousValue)) {
      for (const token of nextTokens) {
        if (!el.classList.contains(token)) el.classList.add(token);
      }
      return;
    }
    patchClassList(el, previousTokens, nextTokens);
    dropEmptySvgClass(el);
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

/** An SVG element renders no `class` attribute for an empty class list. */
export function dropEmptySvgClass(el: Element): void {
  if (isSVGDomElement(el) && el.getAttribute('class') === '') {
    el.removeAttribute('class');
  }
}
