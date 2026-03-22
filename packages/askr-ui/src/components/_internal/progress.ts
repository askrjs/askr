export function normalizeProgressMax(max: number | undefined) {
  if (typeof max !== 'number' || Number.isNaN(max) || max <= 0) {
    return 100;
  }

  return max;
}

export function normalizeProgressValue(
  value: number | null | undefined,
  max: number
) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return Math.min(Math.max(value, 0), max);
}

export function progressPercentage(value: number | null, max: number) {
  if (value === null || max <= 0) {
    return null;
  }

  return Math.round((value / max) * 100);
}

export function defaultProgressValueLabel(value: number | null, max: number) {
  const percentage = progressPercentage(value, max);

  if (percentage === null) {
    return 'Loading';
  }

  return `${percentage}%`;
}
