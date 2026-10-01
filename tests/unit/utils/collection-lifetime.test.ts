import { describe, expect, it } from 'vite-plus/test';
import { createCollection } from '../../../src/foundations/structures/collection';

describe('collection registration lifetimes', () => {
  it('keeps replacement metadata when the previous registration is cleaned up', () => {
    const collection = createCollection<object, string>();
    const first = {};
    const second = {};
    const unregisterFirst = collection.register(first, 'original');
    collection.register(second, 'second');
    const unregisterReplacement = collection.register(first, 'replacement');

    unregisterFirst();
    unregisterFirst();

    expect(collection.items()).toEqual([
      { node: first, metadata: 'replacement' },
      { node: second, metadata: 'second' },
    ]);
    expect(collection.size()).toBe(2);

    unregisterReplacement();

    expect(collection.items()).toEqual([{ node: second, metadata: 'second' }]);
    expect(collection.size()).toBe(1);
  });

  it('keeps a new registration after clearing and cleaning up the old lifetime', () => {
    const collection = createCollection<object, string>();
    const node = {};
    const unregisterOld = collection.register(node, 'old');
    collection.clear();
    const unregisterNew = collection.register(node, 'new');

    unregisterOld();

    expect(collection.items()).toEqual([{ node, metadata: 'new' }]);

    unregisterNew();
    unregisterNew();

    expect(collection.items()).toEqual([]);
    expect(collection.size()).toBe(0);
  });
});
