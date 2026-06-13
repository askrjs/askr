/**
 * askr/resources — async lifecycle helpers
 *
 * This tier exists to make async lifecycle intent explicit in import paths.
 */

export { resource } from '../runtime/operations';
export {
  documentVisible,
  on,
  routeActive,
  timer,
  task,
  stream,
  capture,
  windowFocused,
} from '../runtime/operations';
export type { ResourceResult } from '../runtime/operations';
export type { ActivityPredicate, TimerOptions } from '../runtime/operations';

export { getSignal } from '../runtime/component';
