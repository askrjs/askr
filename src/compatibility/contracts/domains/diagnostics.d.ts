import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { AuthContext, AuthRequirement } from '@askrjs/auth';
import { InferSchema, ObjectSchema } from '@askrjs/schema';

interface RenderDiagnosticsOptions {
  /** Emit one warning per component instance when a render exceeds the threshold. */
  slowRenderWarnings?: boolean;
  /** Slow-render threshold in milliseconds. The default is 5. */
  slowRenderThresholdMs?: number;
}

/**
 * Configure development render diagnostics and return a function that restores
 * the previous configuration. Component counters and timing remain enabled
 * when warning output is disabled.
 */
declare function configureRenderDiagnostics(
  options: RenderDiagnosticsOptions
): () => void;
export { RenderDiagnosticsOptions, configureRenderDiagnostics };
