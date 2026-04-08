export { SSRDataMissingError } from '../common/ssr-errors';

export class SSRInvariantError extends Error {
  readonly code = 'SSR_INVARIANT_VIOLATION';
  constructor(message: string) {
    super(message);
    this.name = 'SSRInvariantError';
    Object.setPrototypeOf(this, SSRInvariantError.prototype);
  }
}
