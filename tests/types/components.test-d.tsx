import { expectAssignable, expectError, expectType } from 'tsd';
import {
  ErrorBoundary,
  type ErrorBoundaryFallbackRender,
  type ErrorBoundaryProps,
} from '@askrjs/askr/components';
import type { JSXElement } from '@askrjs/askr/foundations';

const fallbackRender: ErrorBoundaryFallbackRender = (error, reset) => {
  expectType<unknown>(error);
  expectType<() => void>(reset);
  return <div>retry</div>;
};

expectAssignable<ErrorBoundaryFallbackRender>(fallbackRender);

const boundaryProps: ErrorBoundaryProps = {
  fallback: fallbackRender,
  onError: (error) => {
    expectType<unknown>(error);
  },
  resetKey: 'boundary',
  children: <span>content</span>,
};

expectAssignable<ErrorBoundaryProps>(boundaryProps);
expectAssignable<JSXElement>(ErrorBoundary(boundaryProps));
expectAssignable<JSXElement>(
  <ErrorBoundary fallback={<div>fallback</div>}>
    <span>content</span>
  </ErrorBoundary>
);

expectError(
  <ErrorBoundary
    onError={(error: string) => {
      return error.length;
    }}
  />
);
