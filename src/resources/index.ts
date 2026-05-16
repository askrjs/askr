/**
 * askr/resources — async lifecycle helpers
 *
 * This tier exists to make async lifecycle intent explicit in import paths.
 */

export { resource } from '../runtime/operations';
export { on, timer, task, stream, capture } from '../runtime/operations';
export type { ResourceResult } from '../runtime/operations';

export { getSignal } from '../runtime/component';
