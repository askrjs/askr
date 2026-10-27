import type { ObjectSchema } from '@askrjs/schema';
import type { RouteSearch } from '../common/router';

type JsonSchemaNode = Readonly<Record<string, unknown>>;

const EMPTY_SEARCH: Readonly<RouteSearch> = Object.freeze({});

function hasOwn(record: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** The parsed search of a route that declares no `search` schema. */
export function emptyRouteSearch(): Readonly<RouteSearch> {
  return EMPTY_SEARCH;
}

function node(value: unknown): JsonSchemaNode | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonSchemaNode)
    : undefined;
}

function branches(schema: JsonSchemaNode): JsonSchemaNode[] {
  const found: JsonSchemaNode[] = [];
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    const value = schema[key];
    if (!Array.isArray(value)) continue;
    for (const entry of value as unknown[]) {
      const branch = node(entry);
      if (branch) found.push(branch);
    }
  }
  return found;
}

/**
 * Query values arrive as strings. Convert one to the type its JSON Schema
 * projection declares; a string that does not convert is left as is, for the
 * schema to reject.
 */
function coerce(schema: JsonSchemaNode, value: string): unknown {
  if (Array.isArray(schema.enum)) {
    const match = schema.enum.find((entry) => String(entry) === value);
    if (match !== undefined) return match;
  }
  if (schema.const !== undefined && String(schema.const) === value) {
    return schema.const;
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!types.includes('string')) {
    if (
      (types.includes('number') || types.includes('integer')) &&
      value.trim() !== '' &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }
    if (types.includes('boolean') && (value === 'true' || value === 'false')) {
      return value === 'true';
    }
    if (types.includes('null') && value === 'null') return null;
  }
  for (const branch of branches(schema)) {
    const converted = coerce(branch, value);
    if (converted !== value) return converted;
  }
  return value;
}

function rawSearchValue(
  property: JsonSchemaNode,
  params: URLSearchParams,
  key: string
): unknown {
  const values = params.getAll(key);
  if (values.length === 0) return undefined;
  const items = node(property.items);
  if (property.type === 'array') {
    return values.map((entry) => (items ? coerce(items, entry) : entry));
  }
  return coerce(property, values[0]!);
}

/**
 * Parse a location's query string with a route's `search` schema.
 *
 * Total by design: a navigation is never refused over its query string. A
 * value that fails validation takes the property's schema `default`, or is
 * dropped when it has none; so does a missing property with a default. Keys the
 * schema does not declare are ignored. Declared defaults apply as written.
 */
export function parseRouteSearch(
  schema: ObjectSchema<RouteSearch>,
  search: string
): Readonly<RouteSearch> {
  const properties = node(node(schema.jsonSchema)?.properties) ?? {};
  const params = new URLSearchParams(search);
  const defaults = Object.create(null) as Record<string, unknown>;
  const candidate = Object.create(null) as Record<string, unknown>;
  for (const [key, definition] of Object.entries(properties)) {
    const property = node(definition) ?? {};
    if (property.default !== undefined) defaults[key] = property.default;
    const raw = rawSearchValue(property, params, key);
    if (raw !== undefined) candidate[key] = raw;
  }

  const settled = new Set<string>();
  for (let attempt = 0; attempt <= Object.keys(properties).length; attempt++) {
    const result = schema.safeParse(candidate);
    if (result.success) {
      return Object.freeze({
        ...defaults,
        ...(result.data as Record<string, unknown>),
      }) as Readonly<RouteSearch>;
    }
    let progressed = false;
    for (const issue of result.issues) {
      const key = issue.path[0];
      if (typeof key !== 'string' || !hasOwn(properties, key)) continue;
      if (!hasOwn(candidate, key) && !hasOwn(defaults, key)) continue;
      if (hasOwn(defaults, key) && !settled.has(key)) {
        settled.add(key);
        candidate[key] = defaults[key];
      } else {
        delete candidate[key];
      }
      progressed = true;
    }
    if (!progressed) break;
  }
  // Required properties without a usable value or default stay absent.
  return Object.freeze({ ...defaults, ...candidate }) as Readonly<RouteSearch>;
}
