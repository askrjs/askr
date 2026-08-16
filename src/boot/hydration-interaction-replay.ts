const HYDRATION_INTERACTION_TYPES = [
  'click',
  'dblclick',
  'pointerdown',
  'pointerup',
  'keydown',
  'keyup',
  'input',
  'change',
  'submit',
] as const;

type QueuedHydrationInteraction = {
  target: EventTarget;
  event: Event;
};

/** @internal Root-scoped interaction replay used only during hydration. */
export interface HydrationInteractionReplay {
  registerDeferredBoundaries(boundaries: readonly Element[]): void;
  setOnDeferredBoundariesDrained(callback: () => void): void;
  clearDeferredBoundaries(): void;
  complete(): void;
  abort(): void;
}

function cloneInteractionEvent(event: Event): Event {
  const EventConstructor = event.constructor as new (
    type: string,
    init?: Record<string, unknown>
  ) => Event;
  const eventWithDetails = event as Event & Record<string, unknown>;
  const init = {
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    composed: event.composed,
    detail: eventWithDetails.detail,
    view: eventWithDetails.view,
    key: eventWithDetails.key,
    code: eventWithDetails.code,
    location: eventWithDetails.location,
    repeat: eventWithDetails.repeat,
    isComposing: eventWithDetails.isComposing,
    ctrlKey: eventWithDetails.ctrlKey,
    shiftKey: eventWithDetails.shiftKey,
    altKey: eventWithDetails.altKey,
    metaKey: eventWithDetails.metaKey,
    button: eventWithDetails.button,
    buttons: eventWithDetails.buttons,
    clientX: eventWithDetails.clientX,
    clientY: eventWithDetails.clientY,
    screenX: eventWithDetails.screenX,
    screenY: eventWithDetails.screenY,
    pointerId: eventWithDetails.pointerId,
    pointerType: eventWithDetails.pointerType,
    isPrimary: eventWithDetails.isPrimary,
    data: eventWithDetails.data,
    inputType: eventWithDetails.inputType,
  };

  try {
    return new EventConstructor(event.type, init);
  } catch {
    return new Event(event.type, {
      bubbles: event.bubbles,
      cancelable: event.cancelable,
      composed: event.composed,
    });
  }
}

/**
 * Capture discrete interactions before hydrated handlers exist, then replay
 * them after the listener transaction commits. Deferred boundaries remain
 * interaction-activatable until they are revealed or the root is cleaned up.
 */
export function beginHydrationInteractionReplay(
  root: Element,
  activateBoundary: (boundary: Element) => boolean,
  permanentSkipSelectors: readonly string[] = []
): HydrationInteractionReplay {
  const queued: QueuedHydrationInteraction[] = [];
  const deferredBoundaries = new Set<Element>();
  let active = true;
  let hydratingRoot = true;
  let replaying = false;
  let hadDeferredBoundaries = false;
  let onDeferredBoundariesDrained: (() => void) | undefined;

  function isPermanentlySkipped(target: EventTarget): boolean {
    const element =
      target instanceof Element
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
    if (!element) {
      return false;
    }
    return permanentSkipSelectors.some((selector) => {
      try {
        return element.closest(selector) !== null;
      } catch {
        return false;
      }
    });
  }

  function findDeferredBoundary(target: EventTarget): Element | undefined {
    if (!(target instanceof Node)) {
      return undefined;
    }
    for (const boundary of deferredBoundaries) {
      if (
        boundary.hasAttribute('data-skip-hydrate') &&
        boundary.contains(target)
      ) {
        return boundary;
      }
    }
    return undefined;
  }

  function removeCaptureListeners(): void {
    if (!active) {
      return;
    }
    active = false;
    for (const type of HYDRATION_INTERACTION_TYPES) {
      root.removeEventListener(type, captureInteraction, true);
    }
  }

  function releaseIfFinished(): void {
    if (!hydratingRoot && deferredBoundaries.size === 0) {
      removeCaptureListeners();
    }
  }

  function notifyIfDeferredBoundariesDrained(): void {
    if (hadDeferredBoundaries && deferredBoundaries.size === 0) {
      onDeferredBoundariesDrained?.();
    }
  }

  function replayInteraction(interaction: QueuedHydrationInteraction): void {
    if (
      !(interaction.target instanceof Node) ||
      !root.contains(interaction.target)
    ) {
      return;
    }

    const boundary = findDeferredBoundary(interaction.target);
    if (boundary) {
      try {
        if (!activateBoundary(boundary)) {
          return;
        }
      } catch {
        return;
      }
      deferredBoundaries.delete(boundary);
      notifyIfDeferredBoundariesDrained();
    }

    replaying = true;
    try {
      interaction.target.dispatchEvent(interaction.event);
    } finally {
      replaying = false;
    }
    releaseIfFinished();
  }

  function captureInteraction(event: Event): void {
    if (!active || replaying) {
      return;
    }

    const target = event.target;
    if (!target || isPermanentlySkipped(target)) {
      return;
    }

    const boundary = findDeferredBoundary(target);
    if (!hydratingRoot && !boundary) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    const interaction = {
      target,
      event: cloneInteractionEvent(event),
    };

    if (hydratingRoot) {
      queued.push(interaction);
      return;
    }
    replayInteraction(interaction);
  }

  const installedTypes: string[] = [];
  try {
    for (const type of HYDRATION_INTERACTION_TYPES) {
      root.addEventListener(type, captureInteraction, true);
      installedTypes.push(type);
    }
  } catch (error) {
    active = false;
    for (const type of installedTypes) {
      root.removeEventListener(type, captureInteraction, true);
    }
    throw error;
  }

  return {
    registerDeferredBoundaries(boundaries) {
      for (const boundary of boundaries) {
        deferredBoundaries.add(boundary);
      }
      hadDeferredBoundaries ||= boundaries.length > 0;
    },
    setOnDeferredBoundariesDrained(callback) {
      onDeferredBoundariesDrained = callback;
    },
    clearDeferredBoundaries() {
      deferredBoundaries.clear();
      releaseIfFinished();
    },
    complete() {
      if (!active || !hydratingRoot) {
        return;
      }
      hydratingRoot = false;
      const pending = queued.splice(0);
      for (const interaction of pending) {
        replayInteraction(interaction);
      }
      releaseIfFinished();
    },
    abort() {
      queued.length = 0;
      deferredBoundaries.clear();
      onDeferredBoundariesDrained = undefined;
      hydratingRoot = false;
      removeCaptureListeners();
    },
  };
}
