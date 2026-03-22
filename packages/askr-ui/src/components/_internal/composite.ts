import { createCollection } from '@askrjs/askr/foundations';

export type CompositeCollectionMetadata = {
  index: number;
  disabled: boolean;
  value?: string;
};

const compositeCollections = new Map<
  string,
  ReturnType<typeof createCollection<HTMLElement, CompositeCollectionMetadata>>
>();
const compositeUnregisters = new Map<string, () => void>();

export function getCompositeCollection(id: string) {
  const existing = compositeCollections.get(id);

  if (existing) {
    return existing;
  }

  const created = createCollection<HTMLElement, CompositeCollectionMetadata>();
  compositeCollections.set(id, created);
  return created;
}

export function registerCompositeNode(
  key: string,
  collection: ReturnType<
    typeof createCollection<HTMLElement, CompositeCollectionMetadata>
  >,
  node: HTMLElement | null,
  metadata: CompositeCollectionMetadata
) {
  compositeUnregisters.get(key)?.();

  if (!node) {
    compositeUnregisters.delete(key);
    return;
  }

  compositeUnregisters.set(key, collection.register(node, metadata));
}

export function firstEnabledCompositeIndex(
  items: Array<{ disabled?: boolean }>
): number {
  const index = items.findIndex((item) => !item.disabled);
  return index === -1 ? 0 : index;
}

export function disabledIndexes(
  items: Array<{ disabled?: boolean }>
): number[] {
  return items
    .map((item, index) => (item.disabled ? index : -1))
    .filter((index) => index !== -1);
}
