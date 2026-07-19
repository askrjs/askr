import { isProductionEnvironment } from '../common/env';
import { logger } from '../common/logger';
import type { ComponentInstance } from './component-internal';

/**
 * Report state cells that were never read during a component's completed
 * lifetime. A branch that has not rendered yet is not evidence that its state
 * is unused, so this diagnostic belongs at unmount rather than every commit.
 */
export function warnUnusedStateReads(instance: ComponentInstance): void {
  if (isProductionEnvironment() || !instance.mounted) return;

  const stateValues = instance.stateValues;
  if (!stateValues) return;

  for (let i = 0; i < stateValues.length; i++) {
    const state = stateValues[i];
    const diagnosticEligible = (
      state as
        | (typeof state & { _unusedStateDiagnosticEligible?: boolean })
        | undefined
    )?._unusedStateDiagnosticEligible;
    const hasCommittedUsage =
      (state?._readers?.size ?? 0) > 0 ||
      ((state as { _derivedSubscribers?: Set<unknown> } | undefined)
        ?._derivedSubscribers?.size ?? 0) > 0;

    if (
      state &&
      diagnosticEligible !== false &&
      !state._hasEverBeenRead &&
      !hasCommittedUsage
    ) {
      const warnings = (instance.devWarningsEmitted ??= new Set());
      const key = `unused-state:${i}`;
      if (warnings.has(key)) continue;
      warnings.add(key);

      try {
        const name = instance.fn?.name || '<anonymous>';
        logger.warn(
          `[askr] Unused state variable detected in ${name} at index ${i}. State should be read during render or removed.`
        );
      } catch {
        logger.warn(
          '[askr] Unused state variable detected. State should be read during render or removed.'
        );
      }
    }
  }
}
