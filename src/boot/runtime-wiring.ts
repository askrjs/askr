import { installRuntimeRenderer } from '../runtime';
import { createRendererCapabilities } from '../renderer';

/** Browser composition owns the connection between execution and rendering. */
export function installRendererBridge(): true {
  installRuntimeRenderer(createRendererCapabilities());
  return true;
}
