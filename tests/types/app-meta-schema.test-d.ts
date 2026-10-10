import { schema } from '@askrjs/schema';
import {
  createRouteRegistry,
  currentRoute,
  group,
  lazy,
  matchRoute,
  route,
  to,
  type GroupHelperOptions,
  type RouteOptions,
} from '@askrjs/askr/router';

interface AppMeta {
  readonly requiredGrants: readonly string[];
}
const Search = schema.object({
  tab: schema.enum(['summary', 'history'] as const),
});
const options = {
  appMeta: { requiredGrants: ['report:read'] },
  search: Search,
  loader: ({ params }) => ({ reportId: params.id, internal: true }),
  dehydrate: (data) => ({ reportId: data.reportId }),
} satisfies RouteOptions<
  { id: string },
  typeof Search,
  { reportId: string; internal: boolean },
  { reportId: string },
  AppMeta
>;
const section = {
  appMeta: { requiredGrants: ['app:read'] },
} satisfies GroupHelperOptions<AppMeta>;
const LazyReport = lazy(async () => ({
  default: (params: { id: string }) => params.id,
}));
const registry = createRouteRegistry(() => {
  group(section, () => {
    const report = route('/reports/{id}', LazyReport, options);
    to(report, { id: '42' }, { tab: 'history' });
    const search: NonNullable<typeof report.__search> = { tab: 'history' };
    // @ts-expect-error application metadata must not widen the route search type
    const badSearch: NonNullable<typeof report.__search> = { tab: 'unknown' };
    // @ts-expect-error application metadata must not widen lazy route params
    to(report, { slug: '42' }, { tab: 'history' });
    void [search, badSearch];
  });
});
const leaf = matchRoute<AppMeta>('/reports/42', { registry });
const requirements: readonly string[] | undefined =
  leaf?.appMeta?.requiredGrants;
void requirements;

export function readTypedActiveMeta(): string | undefined {
  const active = currentRoute<{ id: string }, { origin: string }, AppMeta>();
  const id: string = active.params.id;
  const origin: string | undefined = active.state?.origin;
  const grants: readonly string[] | undefined =
    active.matches[0].appMeta?.requiredGrants;
  // @ts-expect-error application metadata remains precise
  const bad: number = active.matches[0].appMeta?.requiredGrants;
  // @ts-expect-error declarations are read-only at the active match boundary
  active.matches[0].appMeta = { requiredGrants: [] };
  void [id, grants, bad];
  return origin;
}
