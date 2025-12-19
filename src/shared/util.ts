/**
 * Small shared utilities
 */

export function isElement(node: unknown): boolean {
  return !!(node && typeof node === 'object' && 'type' in node);
}
