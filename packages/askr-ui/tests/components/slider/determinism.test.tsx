import { describe, it } from 'vitest';
import {
  Slider,
  SliderRange,
  SliderThumb,
  SliderTrack,
} from '../../../src/components/slider';
import { expectDeterministicRender } from '../../determinism';

describe('Slider - Determinism', () => {
  it('should render deterministic slider markup', () => {
    expectDeterministicRender(() => (
      <Slider defaultValue={20}>
        <SliderTrack>
          <SliderRange />
          <SliderThumb />
        </SliderTrack>
      </Slider>
    ));
  });
});
