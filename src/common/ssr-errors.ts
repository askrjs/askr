/**
 * Common call contracts: SSR error types
 */

export class SSRDataMissingError extends Error {
  readonly code = 'SSR_DATA_MISSING';
  constructor(
    message = 'Server-side rendering requires all data to be available synchronously. This component attempted to use async data during SSR.'
  ) {
    super(message);
    this.name = 'SSRDataMissingError';
    Object.setPrototypeOf(this, SSRDataMissingError.prototype);
  }
}
