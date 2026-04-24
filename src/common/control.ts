import type { Props } from './props';

export const __CONTROL_BOUNDARY__ = Symbol('__CONTROL_BOUNDARY__');

const EAGER_CONTROL_PRIMITIVE = Symbol('__ASKR_EAGER_CONTROL_PRIMITIVE__');

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
