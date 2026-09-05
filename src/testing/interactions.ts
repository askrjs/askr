import { dispatch as dispatchEvent } from './render';

/** Dispatch the browser click sequence expected by Askr's delegated events. */
export function click(element: Element): boolean {
  if (!element || typeof element.dispatchEvent !== 'function') {
    throw new TypeError('@askrjs/askr/testing click requires an Element.');
  }
  return dispatchEvent(element, 'click');
}

/** Set a text control's value and emit an input event for each character. */
export function type(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string
): void {
  if (!element || typeof element.dispatchEvent !== 'function') {
    throw new TypeError('@askrjs/askr/testing type requires a text control.');
  }
  for (const character of text) {
    element.value += character;
    dispatchEvent(element, 'input', {
      inputType: 'insertText',
      data: character,
    });
  }
}

/** Dispatch a cancelable bubbling submit event on a form. */
export function submit(form: HTMLFormElement): boolean {
  if (!form || typeof form.dispatchEvent !== 'function') {
    throw new TypeError('@askrjs/askr/testing submit requires a form.');
  }
  return dispatchEvent(form, 'submit');
}
