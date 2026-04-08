/**
 * createCollection
 *
 * Ordered descendant registry for coordinating items without DOM queries.
 *
 * INVARIANTS:
 * 1. Registration order determines item order (no DOM queries)
 * 2. Stable ordering across renders (insertion order preserved)
 * 3. Each item may have metadata (type-safe, user-defined)
 * 4. No implicit global state (explicit collection instances)
 * 5. No automatic cleanup (caller controls lifecycle)
 *
 * DESIGN:
 * - Returns a registry API ({ register, items, clear })
 * - Items are stored in insertion order
 * - Registration returns an unregister function
 * - No side effects on registration (pure data structure)
 *
 * USAGE:
 *   const collection = createCollection<HTMLElement, { disabled: boolean }>();
 *   const unregister = collection.register(element, { disabled: false });
 *   const allItems = collection.items();
 *   unregister();
 */

export type CollectionItem<TNode, TMetadata = unknown> = {
  node: TNode;
  metadata: TMetadata;
};

export interface Collection<TNode, TMetadata = unknown> {
  /**
   * Register a node with optional metadata.
   * Returns an unregister function.
   */
  register(node: TNode, metadata: TMetadata): () => void;

  /**
   * Get all registered items in insertion order.
   */
  items(): ReadonlyArray<CollectionItem<TNode, TMetadata>>;

  /**
   * Clear all registered items.
   */
  clear(): void;

  /**
   * Get the count of registered items.
   */
  size(): number;
}

export function createCollection<TNode, TMetadata = unknown>(): Collection<
  TNode,
  TMetadata
> {
  const registry = new Map<TNode, CollectionItem<TNode, TMetadata>>();

  function register(node: TNode, metadata: TMetadata): () => void {
    const item: CollectionItem<TNode, TMetadata> = { node, metadata };
    registry.set(node, item);

    return () => {
      registry.delete(node);
    };
  }

  function items(): ReadonlyArray<CollectionItem<TNode, TMetadata>> {
    return Array.from(registry.values());
  }

  function clear(): void {
    registry.clear();
  }

  function size(): number {
    return registry.size;
  }

  return {
    register,
    items,
    clear,
    size,
  };
}

/**
 * USAGE EXAMPLE:
 *
 * // Create a collection for menu items
 * const menuItems = createCollection<HTMLElement, { disabled: boolean }>();
 *
 * // Register items
 * const unregister1 = menuItems.register(element1, { disabled: false });
 * const unregister2 = menuItems.register(element2, { disabled: true });
 *
 * // Query items
 * const allItems = menuItems.items();
 * const enabledItems = allItems.filter(item => !item.metadata.disabled);
 *
 * // Cleanup
 * unregister1();
 * unregister2();
 */
