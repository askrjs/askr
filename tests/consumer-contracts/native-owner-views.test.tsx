import { expect, test } from 'vitest';
import { state, type State } from '@askrjs/askr';
import { cleanupApp, createIsland } from '@askrjs/askr/boot';

test('should preserve reader owner views without configuring an extension host', () => {
  const root = document.createElement('main');
  let value!: State<number>;
  createIsland({
    root,
    component() {
      value = state(1);
      return <output>{value()}</output>;
    },
  });
  const owner = [...value._readers!.keys()][0]!;
  expect(owner.mounted).toBe(true);
  expect(owner._ownershipGeneration).toBeDefined();
  cleanupApp(root);
  expect(owner.mounted).toBe(false);
});
