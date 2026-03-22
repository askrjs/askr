export function stripInternalProps<T extends Record<string, unknown>>(
  props: T
): T {
  const next = {} as T;

  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('__')) {
      continue;
    }

    next[key as keyof T] = value as T[keyof T];
  }

  return next;
}
