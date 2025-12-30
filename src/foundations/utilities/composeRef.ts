export type Ref<T> =
	| ((value: T | null) => void)
	| { current: T | null }
	| null
	| undefined;

export function setRef<T>(ref: Ref<T>, value: T | null): void {
	if (!ref) return;
	if (typeof ref === 'function') {
		ref(value);
		return;
	}
	try {
		(ref as { current: T | null }).current = value;
	} catch {
		// Ignore write failures for readonly refs
	}
}

export function composeRefs<T>(...refs: Array<Ref<T>>): (value: T | null) => void {
	return (value: T | null) => {
		for (const ref of refs) setRef(ref, value);
	};
}
