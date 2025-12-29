// Provide a small type declaration for AggregateError for environments/TS versions
// that may not include it in the lib yet. This preserves runtime usage while
// keeping the compiler happy.
declare global {
  interface AggregateError extends Error {
    // Match the built-in lib declaration (uses any[])
    errors: any[];
  }

  interface AggregateErrorConstructor extends ErrorConstructor {
    new (errors: Iterable<any>, message?: string): AggregateError;
    (errors: Iterable<any>, message?: string): AggregateError;
    readonly prototype: AggregateError;
  }

  var AggregateError: AggregateErrorConstructor;
}

export {};
