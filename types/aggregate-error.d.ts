// Provide a small type declaration for AggregateError for environments/TS versions
// that may not include it in the lib yet. This preserves runtime usage while
// keeping the compiler happy.
declare global {
  interface AggregateError extends Error {
    readonly errors: unknown[];
  }

  var AggregateError: {
    new (errors?: unknown[], message?: string): AggregateError;
  };
}

export {};
