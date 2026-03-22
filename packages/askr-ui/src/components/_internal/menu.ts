import { createCollection } from '@askrjs/askr/foundations';
import { collectJsxElements, extractTextContent } from './jsx';

export type MenuCollectionMetadata = {
  index: number;
  disabled: boolean;
  value?: string;
  text?: string;
};

const menuCollections = new Map<
  string,
  ReturnType<typeof createCollection<HTMLElement, MenuCollectionMetadata>>
>();
const menuCollectionUnregisters = new Map<string, () => void>();

export function getMenuCollection(id: string) {
  const existing = menuCollections.get(id);

  if (existing) {
    return existing;
  }

  const created = createCollection<HTMLElement, MenuCollectionMetadata>();
  menuCollections.set(id, created);
  return created;
}

export function collectItemMetadata(
  children: unknown,
  itemType: unknown
): Array<{ disabled: boolean; value?: string; text: string }> {
  return collectJsxElements(
    children,
    (element) => element.type === itemType
  ).map((element) => ({
    disabled: Boolean(element.props?.disabled),
    value:
      typeof element.props?.value === 'string'
        ? element.props.value
        : undefined,
    text: extractTextContent(element.props?.children).trim(),
  }));
}

export function firstEnabledIndex(items: Array<{ disabled: boolean }>): number {
  const enabledIndex = items.findIndex((item) => !item.disabled);
  return enabledIndex === -1 ? 0 : enabledIndex;
}

export function registerCollectionNode(
  key: string,
  collection: ReturnType<
    typeof createCollection<HTMLElement, MenuCollectionMetadata>
  >,
  node: HTMLElement | null,
  metadata: MenuCollectionMetadata
) {
  menuCollectionUnregisters.get(key)?.();

  if (!node) {
    menuCollectionUnregisters.delete(key);
    return;
  }

  menuCollectionUnregisters.set(key, collection.register(node, metadata));
}
