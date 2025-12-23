/**
 * List components for reconciliation testing
 */

import { state } from '../../src/index';

/**
 * Basic list without keys - identity follows position
 */
export const SimpleList = ({ items }: { items: string[] }) => ({
  type: 'ul',
  children: items.map((item) => ({
    type: 'li',
    children: [item],
  })),
});

/**
 * List with stable keys - identity follows keys
 */
export const KeyedList = ({
  items,
}: {
  items: Array<{ id: string; text: string }>;
}) => ({
  type: 'ul',
  children: items.map(({ id, text }) => ({
    type: 'li',
    props: { key: id, 'data-id': id },
    children: [text],
  })),
});

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
    return {
      type: 'li',
      props: {
        key: id,
        'data-id': id,
        onClick: () => localCount.set(localCount() + 1),
      },
      children: [`${id}: ${localCount()}`],
    };
  };

  return {
    type: 'div',
    children: [
      {
        type: 'div',
        props: { class: 'controls' },
        children: [
          {
            type: 'button',
            props: {
              onClick: () => {
                const current = items();
                items.set([...current].reverse());
              },
            },
            children: ['Reverse'],
          },
          {
            type: 'button',
            props: {
              onClick: () => {
                const current = items();
                items.set(current.filter((_, i) => i !== 1));
              },
            },
            children: ['Delete Middle'],
          },
          {
            type: 'button',
            props: {
              onClick: () => {
                const current = items();
                items.set([
                  ...current.slice(0, 1),
                  { id: 'x', value: 0 },
                  ...current.slice(1),
                ]);
              },
            },
            children: ['Insert After First'],
          },
        ],
      },
      {
        type: 'ul',
        children: items().map(({ id }) => ItemComponent({ id })),
      },
    ],
  };
};
