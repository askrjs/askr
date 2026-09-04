import { Props } from './elements.js';
declare const EAGER_CONTROL_PRIMITIVE: unique symbol;
type EagerControlPrimitive<P extends Props = Props> = ((
  props: P
) => unknown) & {
  [EAGER_CONTROL_PRIMITIVE]?: true;
};
export { EagerControlPrimitive };
