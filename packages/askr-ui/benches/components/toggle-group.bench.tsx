import { bench, describe } from 'vitest';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '../../src/components/toggle-group';

describe('ToggleGroup benches', () => {
  bench('create toggle group', () => {
    ToggleGroup({
      defaultValue: 'left',
      children: [ToggleGroupItem({ value: 'left', children: 'Left' })],
    });
  });
});
