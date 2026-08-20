/** @jsxImportSource @askrjs/askr */

import { state } from '@askrjs/askr';
import { createQueryCollection, defineQuery } from '@askrjs/askr/data';

type DatabaseInput = { database: string };
type DatabaseSchema = {
  database: string;
  tables: readonly string[];
};

const schemaByDatabase = defineQuery({
  key: ({ database }: DatabaseInput) => `schemas:${database}`,
  fetch: async ({ database, signal }) => {
    const response = await fetch(`/api/databases/${database}/schema`, {
      signal,
    });
    if (!response.ok) throw new Error(`Could not load ${database}`);
    return (await response.json()) as DatabaseSchema;
  },
});

export function DynamicSchemaBrowser({
  initialDatabases,
}: {
  initialDatabases: readonly string[];
}) {
  const databases = state(initialDatabases);
  const catalogs = createQueryCollection({
    query: schemaByDatabase,
    inputs: () => databases().map((database) => ({ database })),
    key: ({ database }) => database,
    concurrency: 3,
  });

  return (
    <section aria-label="Database schemas">
      <p role="status">
        {catalogs.settled
          ? `${catalogs.results.size} schemas ready`
          : 'Loading schemas...'}
      </p>
      <ul>
        {catalogs.entries.map(({ key, query }) => (
          <li key={key}>
            <h2>{key}</h2>
            {query.loading ? <p>Loading...</p> : null}
            {query.error ? (
              <button type="button" onClick={() => void catalogs.retry(key)}>
                Retry {key}
              </button>
            ) : null}
            {query.data ? <p>{query.data.tables.length} tables</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
