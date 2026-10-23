/** Form value writers synchronize live state and reflected attributes. */
import { tagNamesEqualIgnoreCase } from './element-attributes';

/** Props whose live DOM property must be synced alongside the attribute. */
export function isFormControlProp(key: string): boolean {
  return key === 'value' || key === 'checked' || key === 'selected';
}

/**
 * Elements whose `value` is live user state: removing the prop resets the
 * control to `''`. Other elements (`option`, `button`, `li`, `progress`) use
 * `value` as a plain attribute, and removing the prop removes the attribute.
 */
export function isTextValueControl(tagName: string): boolean {
  return (
    tagNamesEqualIgnoreCase(tagName, 'input') ||
    tagNamesEqualIgnoreCase(tagName, 'textarea') ||
    tagNamesEqualIgnoreCase(tagName, 'select')
  );
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
      const selectedValues = new Set(
        select.multiple && Array.isArray(value)
          ? value.map(String)
          : [stringValue]
      );
      let firstMatch = -1;
      for (let index = 0; index < select.options.length; index++) {
        const option = select.options[index];
        const selected =
          selectedValues.has(option.value) &&
          (select.multiple || firstMatch < 0);
        if (selected && firstMatch < 0) firstMatch = index;
        if (option.hasAttribute('selected') !== selected) {
          if (selected) option.setAttribute('selected', '');
          else option.removeAttribute('selected');
        }
        if (select.multiple && option.selected !== selected) {
          option.selected = selected;
        }
      }
      if (!select.multiple && select.selectedIndex !== firstMatch) {
        select.selectedIndex = firstMatch;
      }
    } else if (
      tagNamesEqualIgnoreCase(tagName, 'input') ||
      tagNamesEqualIgnoreCase(tagName, 'textarea')
    ) {
      const control = el as HTMLInputElement | HTMLTextAreaElement;
      if (control.value !== stringValue) {
        control.value = stringValue;
      }
      // A textarea's initial value is its text content, which is what SSR
      // writes. Fill it while the control has none so client and server
      // markup agree; later updates change only the live value, so typing
      // never rewrites the text node.
      if (
        stringValue !== '' &&
        tagNamesEqualIgnoreCase(tagName, 'textarea') &&
        control.defaultValue === ''
      ) {
        control.defaultValue = stringValue;
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
