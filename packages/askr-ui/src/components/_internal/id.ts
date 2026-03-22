import { formatId } from '@askrjs/askr/foundations';
import { serializeForId } from './jsx';

export function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function resolveCompoundId(
  prefix: string,
  explicitId: string | undefined,
  identity: unknown
): string {
  return formatId({
    prefix,
    id: explicitId ?? `auto-${hashString(serializeForId(identity))}`,
  });
}

export function resolvePartId(rootId: string, part: string): string {
  return formatId({
    prefix: rootId,
    id: part,
  });
}
