// Vitest setup for askr-ui.
// Keep this file minimal; add globals/polyfills here if needed.

// jsdom does not implement CanvasRenderingContext2D unless a canvas impl is
// installed. Some tooling (e.g. axe) may touch canvas APIs, which causes noisy
// "Not implemented" warnings. A null context is sufficient for our tests.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function getContext(): null {
    return null;
  };
}

export {};
