const PAGE_RENDER_ENVELOPE_VERSION = 1 as const;
const HYDRATION_RENDER_URL = 'hu';

export interface PageRenderEnvelope {
  readonly version: typeof PAGE_RENDER_ENVELOPE_VERSION;
  readonly resources: Readonly<Record<string, unknown>>;
  /**
   * Dehydrated data-runtime query entries. Kept apart from `resources` so a
   * query key can never collide with a resource slot key such as `r:0`.
   * Omitted when there are none.
   */
  readonly queries?: Readonly<Record<string, unknown>>;
  readonly route: unknown;
  readonly framework: Readonly<Record<string, unknown>>;
}

type PageRenderEnvelopeInput = {
  readonly resources?: Readonly<Record<string, unknown>> | null;
  readonly queries?: Readonly<Record<string, unknown>> | null;
  readonly route?: unknown;
  readonly framework?: Readonly<Record<string, unknown>> | null;
};

function ownedRecord(
  value: Readonly<Record<string, unknown>> | null | undefined
): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...value });
}

export function createPageRenderEnvelope(
  input: PageRenderEnvelopeInput = {}
): PageRenderEnvelope {
  return Object.freeze({
    version: PAGE_RENDER_ENVELOPE_VERSION,
    resources: ownedRecord(input.resources),
    // Callers pass `queries` only when there are entries.
    ...(input.queries ? { queries: ownedRecord(input.queries) } : {}),
    route: input.route,
    framework: ownedRecord(input.framework),
  });
}

export function isPageRenderEnvelope(
  value: unknown
): value is PageRenderEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PageRenderEnvelope>;
  return (
    candidate.version === PAGE_RENDER_ENVELOPE_VERSION &&
    Boolean(
      candidate.resources &&
      typeof candidate.resources === 'object' &&
      !Array.isArray(candidate.resources)
    ) &&
    Boolean(
      candidate.framework &&
      typeof candidate.framework === 'object' &&
      !Array.isArray(candidate.framework)
    )
  );
}

export function pageRenderEnvelope(
  value: unknown,
  fallback: PageRenderEnvelopeInput = {}
): PageRenderEnvelope {
  if (isPageRenderEnvelope(value)) return value;
  return createPageRenderEnvelope({
    ...fallback,
    route: value ?? fallback.route,
  });
}

export function replacePageRoute(
  value: unknown,
  route: unknown
): PageRenderEnvelope {
  return createPageRenderEnvelope({ ...pageRenderEnvelope(value), route });
}

export function withPageResources(
  value: unknown,
  resources: Readonly<Record<string, unknown>> | null | undefined
): PageRenderEnvelope {
  return createPageRenderEnvelope({ ...pageRenderEnvelope(value), resources });
}

export function withPageFramework(
  value: unknown,
  framework: Readonly<Record<string, unknown>> | null | undefined
): PageRenderEnvelope {
  return createPageRenderEnvelope({ ...pageRenderEnvelope(value), framework });
}

export function withHydrationRenderUrl(
  value: unknown,
  url: string
): PageRenderEnvelope {
  const current = pageRenderEnvelope(value);
  const parsed = new URL(url, 'http://localhost');
  if (!parsed.search && !parsed.hash) return current;
  const renderTarget = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  return withPageFramework(current, {
    ...current.framework,
    [HYDRATION_RENDER_URL]: renderTarget,
  });
}

export function getHydrationRenderUrl(value: unknown): string | undefined {
  if (!isPageRenderEnvelope(value)) return undefined;
  const url = value.framework[HYDRATION_RENDER_URL];
  return typeof url === 'string' ? url : undefined;
}

export function isEmptyPageRenderEnvelope(value: PageRenderEnvelope): boolean {
  return (
    value.route === undefined &&
    Object.keys(value.resources).length === 0 &&
    Object.keys(value.queries ?? {}).length === 0 &&
    Object.keys(value.framework).length === 0
  );
}
