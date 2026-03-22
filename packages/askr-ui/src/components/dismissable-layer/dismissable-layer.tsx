import {
  Slot,
  composeRefs,
  createLayer,
  dismissable,
  mergeProps,
} from '@askrjs/askr/foundations';
import { resolveCompoundId } from '../_internal/id';
import type {
  DismissableLayerAsChildProps,
  DismissableLayerProps,
} from './dismissable-layer.types';

type LayerEntry = {
  node: HTMLElement | null;
  unregister: (() => void) | null;
  isTop: (() => boolean) | null;
  lastEscapeEvent: KeyboardEvent | null;
  lastOutsidePointerEvent: PointerEvent | null;
  disabled: boolean;
  disableOutsidePointerEvents: boolean;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: PointerEvent) => void;
  onInteractOutside?: (event: Event) => void;
  onDismiss?: () => void;
};

const layerManager = createLayer();
const layerEntries = new Map<string, LayerEntry>();

function getLayerEntry(layerId: string): LayerEntry {
  const existing = layerEntries.get(layerId);

  if (existing) {
    return existing;
  }

  const created: LayerEntry = {
    node: null,
    unregister: null,
    isTop: null,
    lastEscapeEvent: null,
    lastOutsidePointerEvent: null,
    disabled: false,
    disableOutsidePointerEvents: false,
  };

  layerEntries.set(layerId, created);
  return created;
}

function unregisterLayer(layerId: string) {
  const entry = layerEntries.get(layerId);

  if (!entry?.unregister) {
    return;
  }

  entry.unregister();
  entry.unregister = null;
  entry.isTop = null;
  entry.node = null;
}

function runDismissCallbacks(layerId: string, trigger: 'escape' | 'outside') {
  const entry = layerEntries.get(layerId);

  if (!entry || entry.disabled || !entry.isTop?.()) {
    return;
  }

  if (trigger === 'escape') {
    entry.onEscapeKeyDown?.(
      entry.lastEscapeEvent ?? new KeyboardEvent('keydown', { key: 'Escape' })
    );
    entry.onDismiss?.();
    return;
  }

  const pointerEvent =
    entry.lastOutsidePointerEvent ??
    new PointerEvent('pointerdown', { bubbles: true });

  if (entry.disableOutsidePointerEvents) {
    pointerEvent.preventDefault?.();
    pointerEvent.stopPropagation?.();
  }

  entry.onPointerDownOutside?.(pointerEvent);
  entry.onInteractOutside?.(pointerEvent);
  entry.onDismiss?.();
}

export function DismissableLayer(props: DismissableLayerProps): JSX.Element;
export function DismissableLayer(
  props: DismissableLayerAsChildProps
): JSX.Element;
export function DismissableLayer(
  props: DismissableLayerProps | DismissableLayerAsChildProps
) {
  const {
    asChild,
    children,
    id,
    disabled = false,
    disableOutsidePointerEvents = false,
    onEscapeKeyDown,
    onPointerDownOutside,
    onInteractOutside,
    onDismiss,
    ref,
    ...rest
  } = props;

  const layerId = resolveCompoundId('dismissable-layer', id, children);
  const entry = getLayerEntry(layerId);
  entry.disabled = disabled;
  entry.disableOutsidePointerEvents = disableOutsidePointerEvents;
  entry.onEscapeKeyDown = onEscapeKeyDown;
  entry.onPointerDownOutside = onPointerDownOutside;
  entry.onInteractOutside = onInteractOutside;
  entry.onDismiss = onDismiss;

  const setNode = (node: HTMLElement | null) => {
    if (entry.node === node) {
      return;
    }

    unregisterLayer(layerId);

    if (!node) {
      return;
    }

    entry.node = node;
    const layer = layerManager.register({
      node,
    });
    entry.unregister = () => {
      layer.unregister();
    };
    entry.isTop = () => layer.isTop();
  };

  const dismissableProps = dismissable({
    node: entry.node,
    disabled,
    onDismiss: (trigger) => {
      runDismissCallbacks(layerId, trigger);
    },
  });

  const finalProps = mergeProps(rest, {
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      setNode
    ),
    'data-dismissable-layer': 'true',
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        entry.lastEscapeEvent = event;
      }

      dismissableProps.onKeyDown(event);
    },
    onPointerDownCapture: (event: PointerEvent) => {
      if (
        entry.node &&
        event.target instanceof Node &&
        !entry.node.contains(event.target)
      ) {
        entry.lastOutsidePointerEvent = event;
      }

      dismissableProps.onPointerDownCapture(event);
    },
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
