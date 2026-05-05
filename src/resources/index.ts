/**
 * askr/resources — async data policy (resources)
 *
 * This tier exists to make async data intent explicit in import paths.
 */

export { resource } from '../runtime/operations';
export { on, timer, task, stream, capture } from '../runtime/operations';
export type { ResourceResult } from '../runtime/operations';

export { createQuery, createMutation, invalidate } from '../data';
export type { Query, Mutation, QueryConsistency } from '../data';

export { getSignal } from '../runtime/component';
