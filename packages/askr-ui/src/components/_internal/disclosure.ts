export type DisclosureType = 'single' | 'multiple';

export function normalizeSingleValue(value: string | undefined): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeMultipleValue(
  value: string[] | string | undefined
): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === 'string');
  }

  if (typeof value === 'string' && value) {
    return [value];
  }

  return [];
}

export function isDisclosureValueOpen(
  type: DisclosureType,
  current: string | string[] | undefined,
  value: string
): boolean {
  if (type === 'multiple') {
    return normalizeMultipleValue(current).includes(value);
  }

  return normalizeSingleValue(current as string | undefined) === value;
}

export function toggleDisclosureValue(
  type: DisclosureType,
  current: string | string[] | undefined,
  value: string,
  collapsible: boolean
): string | string[] {
  if (type === 'multiple') {
    const currentValues = normalizeMultipleValue(current);

    if (currentValues.includes(value)) {
      return currentValues.filter((entry) => entry !== value);
    }

    return [...currentValues, value];
  }

  const currentValue = normalizeSingleValue(current as string | undefined);

  if (currentValue === value) {
    return collapsible ? '' : currentValue;
  }

  return value;
}
