import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { AuthContext, AuthRequirement } from '@askrjs/auth';
import { InferSchema, ObjectSchema } from '@askrjs/schema';

/**
 * Creates a stable holder for an intrinsic element ref.
 *
 * The renderer mutates `current` during commit and clears it during cleanup.
 * Updating the holder never schedules a render.
 */
interface Ref<T extends Element = Element> {
  current: T | null;
}

/** Create a new, empty {@link Ref} holder. */
declare function createRef<T extends Element = Element>(): Ref<T>;
export { Ref, createRef };
