import { installRuntimeRenderer } from '../runtime';
import { createRendererCapabilities } from '../renderer';

let bridged = false;

/**
 * Browser composition owns the connection between execution and rendering.
 *
 * Installs unconditionally: importing the boot entry means native boot owns the
 * renderer, replacing whatever a consumer had configured before that point.
 */
export function installRendererBridge(): true {
  bridged = true;
  installRuntimeRenderer(createRendererCapabilities());
  return true;
}

/**
 * Connect execution to the DOM renderer only if nothing has yet.
 *
 * Unlike the install above this leaves an already-installed host alone, so a
 * renderer a consumer configured after composing boot survives. Kept in this
 * module rather than the composition root so a caller that only needs
 * rendering — driving the runtime directly, as the jsdom test environment does
 * — does not pull root-lifetime wiring into its module graph.
 */
export function ensureRendererBridge(): void {
  if (bridged) return;
  installRendererBridge();
}
