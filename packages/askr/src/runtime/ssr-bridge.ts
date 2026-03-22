import type { RenderContext } from '../common/ssr';

export type SSRBridge = {
  getCurrentSSRContext(): RenderContext | null;
  throwSSRDataMissing(): never;

  // Deterministic SSR render-phase data lookup
  getCurrentRenderData(): Record<string, unknown> | null;
  getNextKey(): string;
};

const defaultBridge: SSRBridge = {
  getCurrentSSRContext() {
    return null;
  },
  throwSSRDataMissing() {
    throw new Error(
      '[Askr] SSR data missing (SSR bridge not installed). ' +
        'If you are rendering on the server, ensure you are using the askr SSR entrypoints.'
    );
  },
  getCurrentRenderData() {
    return null;
  },
  getNextKey() {
    throw new Error(
      '[Askr] getNextKey() called outside SSR render phase (SSR bridge not installed).'
    );
  },
};

let bridge: SSRBridge = defaultBridge;

export function installSSRBridge(next: SSRBridge): void {
  bridge = next;
}

export function getSSRBridge(): SSRBridge {
  return bridge;
}
