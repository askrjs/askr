import { bench, describe } from 'vite-plus/test';
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
