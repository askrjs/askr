import type { Collection } from '@askrjs/askr/foundations';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

let keyboardModality = true;

export function markKeyboardModality() {
  keyboardModality = true;
}

export function markPointerModality() {
  keyboardModality = false;
}

export function isKeyboardModality() {
  return keyboardModality;
}

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(
    (element) =>
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-disabled') !== 'true' &&
      !element.hidden
  );
}

export function focusFirstDescendant(root: HTMLElement): boolean {
  const first = getFocusableElements(root)[0];

  if (!first) {
    return false;
  }

  first.focus();
  return true;
}

export function focusLastDescendant(root: HTMLElement): boolean {
  const elements = getFocusableElements(root);
  const last = elements[elements.length - 1];

  if (!last) {
    return false;
  }

  last.focus();
  return true;
}

export function focusSelectedCollectionItem<
  TMetadata extends { index: number },
>(collection: Collection<HTMLElement, TMetadata>, index: number): boolean {
  const match = collection
    .items()
    .find((item) => item.metadata.index === index)?.node;

  if (!match) {
    return false;
  }

  match.focus();
  return true;
}
