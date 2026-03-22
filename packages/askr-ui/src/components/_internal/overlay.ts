import { DefaultPortal } from '@askrjs/askr/foundations';

export type OverlaySide = 'top' | 'right' | 'bottom' | 'left';
export type OverlayAlign = 'start' | 'center' | 'end';

type OverlayNodes = {
  trigger: HTMLElement | null;
  content: HTMLElement | null;
};

const overlayNodes = new Map<string, OverlayNodes>();

export function getPersistentPortal(_id: string) {
  return DefaultPortal;
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
