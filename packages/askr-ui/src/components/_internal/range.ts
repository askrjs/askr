export function clampRangeValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function snapRangeValue(
  value: number,
  min: number,
  max: number,
  step: number
) {
  if (step <= 0) {
    return clampRangeValue(value, min, max);
  }

  const snapped = Math.round((value - min) / step) * step + min;
  return clampRangeValue(Number(snapped.toFixed(10)), min, max);
}

export function rangePercentage(value: number, min: number, max: number) {
  if (max <= min) {
    return 0;
  }

  return ((value - min) / (max - min)) * 100;
}

export function valueFromPointer(
  event: PointerEvent,
  rect: DOMRect,
  min: number,
  max: number,
  orientation: 'horizontal' | 'vertical'
) {
  if (orientation === 'vertical') {
    const distance = rect.bottom - event.clientY;
    const ratio = rect.height <= 0 ? 0 : distance / rect.height;
    return min + ratio * (max - min);
  }

  const distance = event.clientX - rect.left;
  const ratio = rect.width <= 0 ? 0 : distance / rect.width;
  return min + ratio * (max - min);
}
