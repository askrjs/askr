/**
 * Internal marker used to defer server portal host output until all writes in
 * the current render root are known.
 *
 * @internal
 */
export const SSR_PORTAL_HOST = Symbol.for('askr.ssr-portal-host');
