/** Minimal shape of an event that can be prevented from its default action. */
export interface DefaultPreventable {
  defaultPrevented?: boolean;
  preventDefault?: () => void;
}

/** Minimal shape of an event whose propagation can be stopped. */
export interface PropagationStoppable {
  stopPropagation?: () => void;
}

/** Structural subset of a keyboard event, for handlers that accept native or synthetic events. */
export interface KeyboardLikeEvent
  extends DefaultPreventable, PropagationStoppable {
  key: string;
  currentTarget?: unknown;
  target?: unknown;
}

/** Structural subset of a pointer event, for handlers that accept native or synthetic events. */
export interface PointerLikeEvent
  extends DefaultPreventable, PropagationStoppable {
  target?: unknown;
}

/** Structural subset of a focus event, for handlers that accept native or synthetic events. */
export interface FocusLikeEvent
  extends DefaultPreventable, PropagationStoppable {
  relatedTarget?: unknown;
}
