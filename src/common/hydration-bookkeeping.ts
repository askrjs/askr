/**
 * Attributes the renderers write into server markup for their own
 * bookkeeping. Hydration drops them from adopted elements unless the client
 * renders the same name, and markup verification ignores them.
 */
export const RENDERER_BOOKKEEPING_ATTRS: readonly string[] = [
  'data-skip-hydrate',
  'data-key',
  'data-askr-key-kind',
];
