/**
 * List components for reconciliation testing
 */

import { state } from '../../src/index';

/**
 * Basic list without keys - identity follows position
 */
export const SimpleList = ({ items }: { items: string[] }) => (
  <ul>
    {items.map((item) => (
      <li>{item}</li>
    ))}
  </ul>
);

/**
 * List with stable keys - identity follows keys
 */
export const KeyedList = ({
  items,
}: {
  items: Array<{ id: string; text: string }>;
}) => (
  <ul>
    {items.map(({ id, text }) => (
      <li key={id} data-id={id}>
        {text}
      </li>
    ))}
  </ul>
);

/**
 * Interactive list that can reorder, insert, delete
 */
export const ReorderableList = () => {
  const items = state([
    { id: 'a', value: 0 },
    { id: 'b', value: 0 },
    { id: 'c', value: 0 },
  ]);

  const ItemComponent = ({ id }: { id: string }) => {
    const localCount = state(0);
    return (
      <li
        key={id}
        data-id={id}
        onClick={() => localCount.set(localCount() + 1)}
      >{`${id}: ${localCount()}`}</li>
    );
  };

  return (
    <div>
      <div class={'controls'}>
        <button
          onClick={() => {
            const current = items();
            items.set([...current].reverse());
          }}
        >
          {'Reverse'}
        </button>
        <button
          onClick={() => {
            const current = items();
            items.set(current.filter((_, i) => i !== 1));
          }}
        >
          {'Delete Middle'}
        </button>
        <button
          onClick={() => {
            const current = items();
            items.set([
              ...current.slice(0, 1),
              { id: 'x', value: 0 },
              ...current.slice(1),
            ]);
          }}
        >
          {'Insert After First'}
        </button>
      </div>
      <ul>{items().map(({ id }) => ItemComponent({ id }))}</ul>
    </div>
  );
};
