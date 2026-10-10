import {
  createRouteRegistry,
  currentRoute,
  group,
  matchRoute,
  page,
  route,
  to,
  type GroupHelperOptions,
  type PageHelperOptions,
  type RouteOptions,
  type RouteParams,
} from '@askrjs/askr/router';

interface AppMeta {
  readonly breadcrumb?: string;
  readonly requiredGrants?: readonly string[];
}
const section = {
  appMeta: { breadcrumb: 'Reports', requiredGrants: ['reports:read'] },
} satisfies GroupHelperOptions<AppMeta>;
const host = {
  appMeta: { breadcrumb: 'Report' },
} satisfies PageHelperOptions<AppMeta>;
const leaf = {
  appMeta: { requiredGrants: ['reports:export'] },
  loader: ({ params }) => ({ reportId: params.id }),
} satisfies RouteOptions<
  { id: string },
  undefined,
  { reportId: string },
  { reportId: string },
  AppMeta
>;

const registry = createRouteRegistry(() => {
  group(section, () => {
    page(
      '/reports',
      () => null,
      host,
      () => {
        const report = route('{id}', () => null, leaf);
        to(report, { id: '42' }, { tab: 'summary' });
        // @ts-expect-error path parameter inference remains exact
        to(report, { slug: '42' });
      }
    );
  });
});
const match = matchRoute<AppMeta>('/reports/42', { registry });
const label: string | undefined = match?.appMeta?.breadcrumb;
void label;

export function readAppMeta(): readonly string[] {
  const active = currentRoute<RouteParams, { tab: number }, AppMeta>();
  const tab: number | undefined = active.state?.tab;
  void tab;
  // @ts-expect-error metadata is application-declared and remains precise
  const bad: number = active.matches[0].appMeta?.breadcrumb;
  // @ts-expect-error default metadata reads are unknown, not any
  void currentRoute().matches[0].appMeta?.requiredGrants;
  // @ts-expect-error no application-specific field is added to the router
  void active.requiredGrants;
  void bad;
  return active.matches.flatMap((entry) => entry.appMeta?.requiredGrants ?? []);
}

// `satisfies` checks declarations; the registry callback does not infer or
// contextually enforce the application's schema on global authoring helpers.
const arbitrary = createRouteRegistry(() =>
  route('/untyped', () => null, {
    appMeta: { applicationDefined: true },
  })
);
void arbitrary;
// @ts-expect-error declarations reject a misspelled application field
const typo = { requiredGrant: ['read'] } satisfies AppMeta;
// @ts-expect-error declarations reject an invalid grant array
const invalid = { requiredGrants: [42] } satisfies AppMeta;
void [typo, invalid];
