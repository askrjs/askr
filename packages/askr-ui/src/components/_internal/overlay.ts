export type OverlaySide = 'top' | 'right' | 'bottom' | 'left';
export type OverlayAlign = 'start' | 'center' | 'end';
export type OverlayPortal = {
  (): JSX.Element | null;
  render(props: { children?: unknown }): JSX.Element | null;
};

type OverlayNodes = {
  trigger: HTMLElement | null;
  content: HTMLElement | null;
  cleanup?: () => void;
};

const overlayNodes = new Map<string, OverlayNodes>();
const overlayPortals = new Map<string, OverlayPortal>();

type OverlayPositionMode = 'anchored' | 'centered';

type OverlayPositionOptions = {
  mode?: OverlayPositionMode;
  side?: OverlaySide;
  align?: OverlayAlign;
  sideOffset?: number;
  matchTriggerWidth?: boolean;
  viewportPadding?: number;
  zIndex?: number;
};

function createOverlayPortal(): OverlayPortal {
  let value: unknown = null;

  function OverlayPortalHost() {
    return value as JSX.Element | null;
  }

  OverlayPortalHost.render = function OverlayPortalRender(props: {
    children?: unknown;
  }) {
    value = props.children ?? null;
    return null;
  };

  return OverlayPortalHost;
}

export function getPersistentPortal(id: string) {
  const existing = overlayPortals.get(id);

  if (existing) {
    return existing;
  }

  const created = createOverlayPortal();
  overlayPortals.set(id, created);
  return created;
}

export function getOverlayNodes(id: string): OverlayNodes {
  const existing = overlayNodes.get(id);

  if (existing) {
    return existing;
  }

  const created: OverlayNodes = {
    trigger: null,
    content: null,
  };

  overlayNodes.set(id, created);
  return created;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function resolveAnchoredSide(
  side: OverlaySide,
  triggerRect: DOMRect,
  contentRect: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
  offset: number,
  padding: number
): OverlaySide {
  const available = {
    top: triggerRect.top - padding - offset,
    right: viewportWidth - triggerRect.right - padding - offset,
    bottom: viewportHeight - triggerRect.bottom - padding - offset,
    left: triggerRect.left - padding - offset,
  };

  if (
    side === 'bottom' &&
    available.bottom < contentRect.height &&
    available.top > available.bottom
  ) {
    return 'top';
  }

  if (
    side === 'top' &&
    available.top < contentRect.height &&
    available.bottom > available.top
  ) {
    return 'bottom';
  }

  if (
    side === 'right' &&
    available.right < contentRect.width &&
    available.left > available.right
  ) {
    return 'left';
  }

  if (
    side === 'left' &&
    available.left < contentRect.width &&
    available.right > available.left
  ) {
    return 'right';
  }

  return side;
}

function resolveAlignedOffset(
  align: OverlayAlign,
  start: number,
  end: number,
  size: number
) {
  if (align === 'center') {
    return start + (end - start) / 2 - size / 2;
  }

  if (align === 'end') {
    return end - size;
  }

  return start;
}

function applyAnchoredPosition(
  trigger: HTMLElement,
  content: HTMLElement,
  options: Required<OverlayPositionOptions>
) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const triggerRect = trigger.getBoundingClientRect();

  if (options.matchTriggerWidth) {
    content.style.minWidth = `${Math.round(triggerRect.width)}px`;
  }

  const contentRect = content.getBoundingClientRect();
  const resolvedSide = resolveAnchoredSide(
    options.side,
    triggerRect,
    contentRect,
    viewportWidth,
    viewportHeight,
    options.sideOffset,
    options.viewportPadding
  );

  let left = 0;
  let top = 0;

  if (resolvedSide === 'top' || resolvedSide === 'bottom') {
    left = resolveAlignedOffset(
      options.align,
      triggerRect.left,
      triggerRect.right,
      contentRect.width
    );
    top =
      resolvedSide === 'bottom'
        ? triggerRect.bottom + options.sideOffset
        : triggerRect.top - contentRect.height - options.sideOffset;
  } else {
    top = resolveAlignedOffset(
      options.align,
      triggerRect.top,
      triggerRect.bottom,
      contentRect.height
    );
    left =
      resolvedSide === 'right'
        ? triggerRect.right + options.sideOffset
        : triggerRect.left - contentRect.width - options.sideOffset;
  }

  const maxLeft = Math.max(
    options.viewportPadding,
    viewportWidth - contentRect.width - options.viewportPadding
  );
  const maxTop = Math.max(
    options.viewportPadding,
    viewportHeight - contentRect.height - options.viewportPadding
  );

  content.dataset.side = resolvedSide;
  content.style.position = 'fixed';
  content.style.inset = 'auto';
  content.style.margin = '0';
  content.style.left = `${Math.round(
    clamp(left, options.viewportPadding, maxLeft)
  )}px`;
  content.style.top = `${Math.round(
    clamp(top, options.viewportPadding, maxTop)
  )}px`;
}

function applyCenteredPosition(
  content: HTMLElement,
  options: Required<OverlayPositionOptions>
) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const contentRect = content.getBoundingClientRect();
  const maxLeft = Math.max(
    options.viewportPadding,
    viewportWidth - contentRect.width - options.viewportPadding
  );
  const maxTop = Math.max(
    options.viewportPadding,
    viewportHeight - contentRect.height - options.viewportPadding
  );

  content.style.position = 'fixed';
  content.style.inset = 'auto';
  content.style.margin = '0';
  content.style.left = `${Math.round(
    clamp(
      (viewportWidth - contentRect.width) / 2,
      options.viewportPadding,
      maxLeft
    )
  )}px`;
  content.style.top = `${Math.round(
    clamp(
      (viewportHeight - contentRect.height) / 2,
      options.viewportPadding,
      maxTop
    )
  )}px`;
}

export function clearOverlayPosition(id: string) {
  const nodes = overlayNodes.get(id);

  if (!nodes?.cleanup) {
    return;
  }

  nodes.cleanup();
  nodes.cleanup = undefined;
}

export function syncOverlayPosition(
  id: string,
  options: OverlayPositionOptions = {}
) {
  if (typeof window === 'undefined') {
    return;
  }

  const nodes = getOverlayNodes(id);
  clearOverlayPosition(id);

  if (!nodes.content) {
    return;
  }

  const resolvedOptions: Required<OverlayPositionOptions> = {
    mode: options.mode ?? 'anchored',
    side: options.side ?? 'bottom',
    align: options.align ?? 'start',
    sideOffset: options.sideOffset ?? 0,
    matchTriggerWidth: options.matchTriggerWidth ?? false,
    viewportPadding: options.viewportPadding ?? 12,
    zIndex: options.zIndex ?? (options.mode === 'centered' ? 50 : 40),
  };

  let frame = 0;
  let resizeObserver: ResizeObserver | null = null;

  const update = () => {
    const { trigger, content } = nodes;

    if (!content) {
      return;
    }

    content.style.zIndex = String(resolvedOptions.zIndex);

    if (resolvedOptions.mode === 'centered') {
      applyCenteredPosition(content, resolvedOptions);
      return;
    }

    if (!trigger) {
      return;
    }

    applyAnchoredPosition(trigger, content, resolvedOptions);
  };

  const scheduleUpdate = () => {
    if (frame) {
      cancelAnimationFrame(frame);
    }

    frame = requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  };

  scheduleUpdate();
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('scroll', scheduleUpdate, true);

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      scheduleUpdate();
    });

    if (nodes.trigger) {
      resizeObserver.observe(nodes.trigger);
    }

    resizeObserver.observe(nodes.content);
  }

  nodes.cleanup = () => {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }

    window.removeEventListener('resize', scheduleUpdate);
    window.removeEventListener('scroll', scheduleUpdate, true);
    resizeObserver?.disconnect();
    resizeObserver = null;
  };
}
