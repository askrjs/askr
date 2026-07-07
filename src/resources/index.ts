/**
 * askr/resources — async lifecycle helpers
 *
 * This tier exists to make async lifecycle intent explicit in import paths.
 */

export { resource } from '../runtime';
export {
  documentVisible,
  on,
  routeActive,
  timer,
  task,
  stream,
  capture,
  windowFocused,
} from '../runtime';
export type { ResourceResult } from '../runtime';
export type { ActivityPredicate, TimerOptions } from '../runtime';

export { getSignal } from '../runtime';
