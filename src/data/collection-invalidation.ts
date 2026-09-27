export interface CollectionInvalidator {
  readonly invalidationConcurrency: number;
  invalidateCell(cell: object): void;
}

const owners = new WeakMap<object, Set<CollectionInvalidator>>();

export function registerCollectionCell(
  cell: object,
  owner: CollectionInvalidator
): void {
  let registrations = owners.get(cell);
  if (!registrations) {
    registrations = new Set();
    owners.set(cell, registrations);
  }
  registrations.add(owner);
}

export function unregisterCollectionCell(
  cell: object,
  owner: CollectionInvalidator
): void {
  const registrations = owners.get(cell);
  registrations?.delete(owner);
  if (registrations?.size === 0) owners.delete(cell);
}

/** A shared query uses the smallest cap among its live collection readers. */
export function invalidateCollectionCell(cell: object): boolean {
  const registrations = owners.get(cell);
  if (!registrations?.size) return false;
  let selected: CollectionInvalidator | undefined;
  for (const owner of registrations) {
    if (
      !selected ||
      owner.invalidationConcurrency < selected.invalidationConcurrency
    ) {
      selected = owner;
    }
  }
  selected!.invalidateCell(cell);
  return true;
}
