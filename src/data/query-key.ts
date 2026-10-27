import type { InvalidateOptions, QueryKeyPart, QueryScope } from './types';

type InvalidateQueryPrefix = (
  prefix: string,
  options?: InvalidateOptions
) => void;

function encodeQueryKeyString(value: string): string {
  const encoded: string[] = [];
  for (let index = 0; index < value.length;) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        encoded.push(encodeURIComponent(value.slice(index, index + 2)));
        index += 2;
      } else {
        encoded.push(`%u${code.toString(16).toUpperCase().padStart(4, '0')}`);
        index += 1;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      encoded.push(`%u${code.toString(16).toUpperCase().padStart(4, '0')}`);
      index += 1;
      continue;
    }
    const start = index;
    while (index < value.length) {
      const next = value.charCodeAt(index);
      if (next >= 0xd800 && next <= 0xdfff) break;
      index += 1;
    }
    encoded.push(encodeURIComponent(value.slice(start, index)));
  }
  return encoded.join('');
}

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
      return `s=${encodeQueryKeyString(part)}`;
    case 'number':
      return `n=${serializeQueryKeyNumber(part)}`;
    case 'boolean':
      return `b=${part ? '1' : '0'}`;
    case 'object':
      if (Array.isArray(part)) {
        const items: string[] = [];
        const length = part.length;
        for (let index = 0; index < length; index++) {
          items.push(serializeQueryKeyPart(part[index]));
        }
        return `a[${items.join(',')}]`;
      }

      const objectPart = part as { readonly [key: string]: QueryKeyPart };
      return `o{${Object.keys(objectPart)
        .sort()
        .map(
          (key) =>
            `${encodeQueryKeyString(key)}=${serializeQueryKeyPart(objectPart[key])}`
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
