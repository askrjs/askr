export interface DefaultPreventable {
  defaultPrevented?: boolean;
  preventDefault?: () => void;
}

export interface PropagationStoppable {
  stopPropagation?: () => void;
}

export interface KeyboardLikeEvent
  extends DefaultPreventable, PropagationStoppable {
  key: string;
}

export interface PointerLikeEvent
  extends DefaultPreventable, PropagationStoppable {
  target?: unknown;
}

export interface FocusLikeEvent
  extends DefaultPreventable, PropagationStoppable {
  relatedTarget?: unknown;
}
