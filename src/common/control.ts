import type { Props } from './props';

export const __CONTROL_BOUNDARY__ = Symbol('__CONTROL_BOUNDARY__');

const EAGER_CONTROL_PRIMITIVE = Symbol('__ASKR_EAGER_CONTROL_PRIMITIVE__');
const TRANSPARENT_COMPONENT_RESULT = Symbol(
  '__ASKR_TRANSPARENT_COMPONENT_RESULT__'
);

export type EagerControlPrimitive<P extends Props = Props> = ((
  props: P
) => unknown) & {
  [EAGER_CONTROL_PRIMITIVE]?: true;
};

export function markEagerControlPrimitive<
  T extends (...args: never[]) => unknown,
>(primitive: T): T {
  (
    primitive as T & {
      [EAGER_CONTROL_PRIMITIVE]?: true;
    }
  )[EAGER_CONTROL_PRIMITIVE] = true;
  return primitive;
}

export function isEagerControlPrimitive(
  value: unknown
): value is EagerControlPrimitive {
  return (
    typeof value === 'function' &&
    Boolean(
      (
        value as {
          [EAGER_CONTROL_PRIMITIVE]?: true;
        }
      )[EAGER_CONTROL_PRIMITIVE]
    )
  );
}

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
