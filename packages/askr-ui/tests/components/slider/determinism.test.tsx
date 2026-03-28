import { describe, it } from 'vite-plus/test';
import {
  Slider,
  SliderRange,
  SliderThumb,
  SliderTrack,
} from '../../../src/components/primitives/slider';
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
