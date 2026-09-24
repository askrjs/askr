import type {
  AccessDenyDecision,
  AccessRedirectDecision,
} from '../common/router';

export { SSRDataMissingError } from '../common/ssr-errors';

export class SSRInvariantError extends Error {
  readonly code = 'SSR_INVARIANT_VIOLATION';
  constructor(message: string) {
    super(message);
    this.name = 'SSRInvariantError';
    Object.setPrototypeOf(this, SSRInvariantError.prototype);
  }
}

/**
 * Thrown by synchronous route SSR (`renderToString()`/`renderToStream()`) when
 * route auth or a policy redirects or denies the request. Nothing is rendered;
 * send `decision` as the HTTP response (for example a 302 to `decision.to`, or
 * `decision.status`).
 */
export class SSRAccessDecisionError extends Error {
  readonly code = 'SSR_ACCESS_DECISION';
  readonly decision: AccessRedirectDecision | AccessDenyDecision;
  constructor(decision: AccessRedirectDecision | AccessDenyDecision) {
    super(
      decision.kind === 'redirect'
        ? `SSR: route access redirected to ${decision.to}.`
        : `SSR: route access denied with status ${decision.status}.`
    );
    this.name = 'SSRAccessDecisionError';
    this.decision = decision;
    Object.setPrototypeOf(this, SSRAccessDecisionError.prototype);
  }
}
