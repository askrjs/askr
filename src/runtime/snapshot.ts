/**
 * State snapshot for SSR and hydration
 * Serializes per-component state indexed by (componentId, stateIndex)
 * Enables deterministic serialization and replay
 */

import type { ComponentInstance } from './component';

export interface Snapshot {
  [componentId: string]: {
    [stateIndex: number]: unknown;
  };
}

export function createSnapshot(): Snapshot {
  return {};
}

/**
 * Capture state from active component instances
 * @param components Map of componentId -> ComponentInstance
 * @returns Snapshot with structure { [componentId]: { [stateIndex]: value } }
 */
export function captureSnapshot(
  components: Map<string, ComponentInstance>
): Snapshot {
  const snapshot: Snapshot = {};
  for (const [id, instance] of components) {
    snapshot[id] = {};
    // Read all state values from this component's stateValues array
    for (let i = 0; i < instance.stateValues.length; i++) {
      const stateObj = instance.stateValues[i];
      if (stateObj) {
        // Call the state function to get current value
        snapshot[id][i] = stateObj();
      }
    }
  }
  return snapshot;
}

/**
 * Restore component state from snapshot
 * @param snapshot Snapshot with structure { [componentId]: { [stateIndex]: value } }
 * @param components Map of componentId -> ComponentInstance
 */
export function restoreSnapshot(
  snapshot: Snapshot,
  components: Map<string, ComponentInstance>
): void {
  for (const [id, stateMap] of Object.entries(snapshot)) {
    const instance = components.get(id);
    if (!instance) continue;

    // Restore each state value
    for (const [indexStr, value] of Object.entries(stateMap)) {
      const index = parseInt(indexStr, 10);
      const stateObj = instance.stateValues[index];
      if (stateObj) {
        // Use set to restore the value (bypasses render-time guard since we're outside render)
        stateObj.set(value as never);
      }
    }
  }
}
