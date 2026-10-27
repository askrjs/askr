/**
 * Whether the CSRF token the server embedded in the hydration envelope may
 * still be used. A token is bound to the session that was current when the
 * page rendered, so a change of session identity (login, logout, replacement)
 * revokes it; later submissions read the document (`<meta name="csrf-token">`)
 * or the configured cookie instead.
 */
let hydratedTokenRevoked = false;

/** @internal Called when the session identity changes. */
export function revokeHydratedCsrfToken(): void {
  hydratedTokenRevoked = true;
}

/** @internal */
export function isHydratedCsrfTokenRevoked(): boolean {
  return hydratedTokenRevoked;
}

/** @internal A freshly hydrated page carries a valid token again; part of the router-wide reset. */
export function resetHydratedCsrfToken(): void {
  hydratedTokenRevoked = false;
}
