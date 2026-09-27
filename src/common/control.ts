const TRANSPARENT_COMPONENT_RESULT = Symbol(
  '__ASKR_TRANSPARENT_COMPONENT_RESULT__'
);

export function markTransparentComponentResult<
  T extends (...args: never[]) => unknown,
>(component: T): T {
  (
    component as T & {
      [TRANSPARENT_COMPONENT_RESULT]?: true;
    }
  )[TRANSPARENT_COMPONENT_RESULT] = true;
  return component;
}

export function hasTransparentComponentResult(value: unknown): boolean {
  return (
    typeof value === 'function' &&
    Boolean(
      (
        value as {
          [TRANSPARENT_COMPONENT_RESULT]?: true;
        }
      )[TRANSPARENT_COMPONENT_RESULT]
    )
  );
}
