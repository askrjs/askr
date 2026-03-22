import { bench, describe } from 'vitest';
import {
  Slider,
  SliderRange,
  SliderThumb,
  SliderTrack,
} from '../../src/components/slider';

describe('Slider benches', () => {
  bench('create slider', () => {
    Slider({
      defaultValue: 20,
      children: [
        SliderTrack({
          children: [SliderRange({}), SliderThumb({})],
        }),
      ],
    });
  });
});
