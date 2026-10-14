let activeRouteRequestId = 0;
let activeRouteRequestController: AbortController | null = null;

export function beginRouteRequest(): { id: number; signal: AbortSignal } {
  const id = ++activeRouteRequestId;
  const previous = activeRouteRequestController;
  const controller = new AbortController();
  // Publish this owner before invoking predecessor listeners. A listener may
  // supersede or cancel it; this invocation must still return its own pair.
  activeRouteRequestController = controller;
  previous?.abort();

  return {
    id,
    signal: controller.signal,
  };
}

export function isStaleRouteRequest(requestId: number): boolean {
  return requestId !== activeRouteRequestId;
}

/**
 * @internal Teardown-only cancellation. Prefer aborting through the signal
 * returned by `beginRouteRequest()`; this exists for registry teardown, where
 * no request owns the abort.
 */
export function cancelRouteRequests(): void {
  activeRouteRequestId += 1;
  const previous = activeRouteRequestController;
  activeRouteRequestController = null;
  previous?.abort();
}
