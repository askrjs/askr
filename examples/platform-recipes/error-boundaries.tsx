/** @jsxImportSource @askrjs/askr */

import { state } from '@askrjs/askr';
import { ErrorBoundary } from '@askrjs/askr/components';
import {
  createRouteRegistry,
  fallback,
  group,
  Link,
  route,
} from '@askrjs/askr/router';

function UnstableWidget({ shouldFail }: { shouldFail: boolean }) {
  if (shouldFail) {
    throw new Error('Widget failed');
  }
  return <p>Widget recovered.</p>;
}

export function LocalBoundaryRecipe() {
  const shouldFail = state(true);

  return (
    <article>
      <h1>Account overview</h1>
      <p>The route remains usable when the optional widget fails.</p>
      <ErrorBoundary
        resetKey={shouldFail()}
        fallback={(_error, reset) => (
          <section role="alert">
            <p>Activity could not be loaded.</p>
            <button
              type="button"
              onClick={() => {
                shouldFail.set(false);
                reset();
              }}
            >
              Retry activity
            </button>
          </section>
        )}
      >
        <UnstableWidget shouldFail={shouldFail()} />
      </ErrorBoundary>
    </article>
  );
}

function RouteBoundary({ children }: { children?: unknown }) {
  return (
    <ErrorBoundary
      fallback={
        <section role="alert">
          <h1>This page could not be displayed.</h1>
          <Link href="/">Return home</Link>
        </section>
      }
    >
      {children as never}
    </ErrorBoundary>
  );
}

function BrokenPage(): never {
  throw new Error('Route failed');
}

export function createErrorBoundaryRegistry() {
  return createRouteRegistry(() => {
    group({ layout: RouteBoundary }, () => {
      route('/', () => <h1>Home</h1>);
      route('/broken', BrokenPage);
      fallback(() => <h1>Page not found</h1>);
    });
  });
}
