import type { InvalidateOptions, QueryKeyPart, QueryScope } from './types';

type InvalidateQueryPrefix = (
  prefix: string,
  options?: InvalidateOptions
) => void;

function serializeQueryKeyNumber(part: number): string {
  if (Number.isNaN(part)) {
    return 'NaN';
  }

  if (Object.is(part, -0)) {
    return '-0';
  }

  if (part === Infinity) {
    return 'Infinity';
  }

  if (part === -Infinity) {
    return '-Infinity';
  }

  return String(part);
}

function serializeQueryKeyPart(part: QueryKeyPart): string {
  if (typeof (part as unknown) === 'symbol') {
    throw new Error('[Askr] queryScope() key parts cannot be symbols.');
  }

  if (part === null) {
    return 'null';
  }

  if (part === undefined) {
    return 'undefined';
  }

  switch (typeof part) {
    case 'string':
      return `s=${encodeURIComponent(part)}`;
    case 'number':
      return `n=${serializeQueryKeyNumber(part)}`;
    case 'boolean':
      return `b=${part ? '1' : '0'}`;
    case 'object':
      if (Array.isArray(part)) {
        return `a[${part.map((item) => serializeQueryKeyPart(item)).join(',')}]`;
      }

      const objectPart = part as { readonly [key: string]: QueryKeyPart };
      return `o{${Object.keys(objectPart)
        .sort()
        .map(
          (key) =>
            `${encodeURIComponent(key)}=${serializeQueryKeyPart(objectPart[key])}`
        )
        .join(',')}}`;
    default:
      return String(part);
  }
}

export function createQueryScope(
  namespace: string,
  invalidate: InvalidateQueryPrefix
): QueryScope {
  if (typeof namespace !== 'string' || namespace.trim().length === 0) {
    throw new Error(
      '[Askr] queryScope() requires a non-empty namespace string.'
    );
  }

  const build = (parts: readonly QueryKeyPart[]): string =>
    [namespace, ...parts].map(serializeQueryKeyPart).join(':') + ':';

  return {
    key(...parts) {
      return build(parts);
    },

    prefix(...parts) {
      return build(parts);
    },

    invalidate(parts, options) {
      invalidate(build(parts), options);
    },
  };
}
