import '../jsx-globals.js';

/**
 * Get the abort signal for the current component.
 *
 * The signal is guaranteed to be aborted when:
 * - Component unmounts
 * - Navigation occurs (different route)
 * - Parent is destroyed
 */
declare function getSignal(): AbortSignal;

export { getSignal };
