export class SSRDataMissingError extends Error {
  readonly code = 'SSR_DATA_MISSING';
  constructor(message = 'Data required for SSR is missing') {
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
