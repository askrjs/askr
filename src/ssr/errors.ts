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

export class SSRInvariantError extends Error {
  readonly code = 'SSR_INVARIANT_VIOLATION';
  constructor(message: string) {
    super(message);
    this.name = 'SSRInvariantError';
    Object.setPrototypeOf(this, SSRInvariantError.prototype);
  }
}
