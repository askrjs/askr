/**
 * askr/resources — async data policy (resources)
 *
 * This tier exists to make async data intent explicit in import paths.
 */

export { resource } from '../runtime/operations';
export type { ResourceResult as DataResult } from '../runtime/operations';

export { getSignal } from '../runtime/component';
