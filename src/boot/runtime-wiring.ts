import { getDefaultRuntime, type AskrRuntime } from '../compatibility/runtime';
import { rendererHostView } from '../compatibility/renderer';
import { createRendererCapabilities } from '../renderer';

/** Browser composition owns the connection between execution and rendering. */
export function installRendererBridge(
  runtime: AskrRuntime = getDefaultRuntime()
): true {
  runtime.configureRenderer(rendererHostView(createRendererCapabilities()));
  return true;
}
