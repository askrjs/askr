import { ELEMENT_TYPE, Fragment } from '../../jsx';
import type { JSXElement } from '../../jsx';

export interface PresenceProps {
	present: boolean | (() => boolean);
	children?: unknown;
}

/**
 * Presence
 *
 * Structural policy primitive for conditional mount/unmount.
 * - No timers
 * - No animation coupling
 * - No DOM side-effects
 */
export function Presence({ present, children }: PresenceProps): JSXElement | null {
	const isPresent = typeof present === 'function' ? present() : Boolean(present);
	if (!isPresent) return null;

	return {
		$$typeof: ELEMENT_TYPE,
		type: Fragment,
		props: { children },
	} as JSXElement;
}
