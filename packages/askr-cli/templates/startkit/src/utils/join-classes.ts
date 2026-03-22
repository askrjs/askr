/** Merge class name strings, dropping any empty/undefined values. */
export function joinClasses(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
