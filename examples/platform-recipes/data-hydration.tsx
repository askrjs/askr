/** @jsxImportSource @askrjs/askr */

import {
  createDataRuntime,
  createQuery,
  createQueryPrefetchContext,
  defineQuery,
  defineServerQueries,
  dehydrateDataRuntime,
  hydrateDataRuntime,
  invalidate,
  prefetchQuery,
  serveQuery,
  type DataRuntime,
  type ServerQueryHandler,
} from '@askrjs/askr/data';

type User = {
  id: string;
  name: string;
};

export const userById = defineQuery({
  key: ({ id }: { id: string }) => `user:${id}`,
  fetch: async ({ id, signal }) => {
    const response = await fetch(`/api/users/${id}`, { signal });
    if (!response.ok) {
      throw new Error('User request failed');
    }
    return (await response.json()) as User;
  },
});

export async function createUserHydrationPayload(
  id: string,
  handler: ServerQueryHandler<{ id: string }, User>
): Promise<Record<string, unknown>> {
  const runtime = createDataRuntime();
  const registry = defineServerQueries(serveQuery(userById, handler));
  const context = createQueryPrefetchContext({
    runtime,
    registry,
    mode: 'ssr',
  });

  await prefetchQuery(context, userById, { id });
  return dehydrateDataRuntime(runtime);
}

export function createHydratedUserRuntime(
  payload: Record<string, unknown>
): DataRuntime {
  const runtime = createDataRuntime();
  hydrateDataRuntime(runtime, payload);
  return runtime;
}

export function UserPanel({
  id,
  runtime,
}: {
  id: string;
  runtime: DataRuntime;
}) {
  const user = createQuery(userById, { id }, { runtime });

  if (user.loading) {
    return <p role="status">Loading user...</p>;
  }
  if (user.staleReason === 'error' && user.data === null) {
    return (
      <section role="alert">
        <p>Could not load the user.</p>
        <button type="button" onClick={() => void user.refresh()}>
          Retry
        </button>
      </section>
    );
  }

  return (
    <section>
      <h1>{user.data.name}</h1>
      {user.staleReason === 'error' ? (
        <p role="alert">Refresh failed; showing saved data.</p>
      ) : null}
      <button
        type="button"
        disabled={user.refreshing}
        onClick={() => invalidate(`user:${id}`, { runtime })}
      >
        Refresh
      </button>
    </section>
  );
}
