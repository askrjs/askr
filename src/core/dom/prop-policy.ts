/** Prop categories shared by orchestration and binding installation. */
import { isCustomElementName } from '../../common/attr-names';
import { getDomPropertyName } from '../../common/dom-properties';

export function isBinding(key: string, value: unknown): value is () => unknown {
  return (
    typeof value === 'function' &&
    key !== 'ref' &&
    key !== 'dangerouslySetInnerHTML'
  );
}

/** A `<select>` value can only select options that already exist. */
export function followsChildren(tag: string, key: string): boolean {
  return key === 'value' && tag === 'select';
}

export function isSimpleAttribute(
  tag: string,
  key: string,
  value: unknown
): boolean {
  return (
    !isCustomElementName(tag) &&
    !key.includes(':') &&
    getDomPropertyName(tag, key, value) === null &&
    key !== 'class' &&
    key !== 'className' &&
    key !== 'style' &&
    key !== 'value' &&
    key !== 'checked' &&
    key !== 'selected' &&
    key !== 'dangerouslySetInnerHTML'
  );
}

export function isInputValue(tag: string, key: string): boolean {
  return key === 'value' && (tag === 'input' || tag === 'textarea');
}

export function isBooleanControl(tag: string, key: string): boolean {
  return (
    (tag === 'input' && key === 'checked') ||
    (tag === 'option' && key === 'selected')
  );
}
