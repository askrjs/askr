import { describe, it } from 'vite-plus/test';
import {
  Slider,
  SliderRange,
  SliderThumb,
  SliderTrack,
} from '../../../src/components/primitives/slider';
import { expectNoAxeViolations } from '../../accessibility';

describe('Slider - Accessibility', () => {
  it('should have no automated axe violations given slider with labelled thumb', async () => {
    await expectNoAxeViolations(
      <Slider defaultValue={20}>
        <SliderTrack>
          <SliderRange />
          <SliderThumb aria-label="Volume" />
        </SliderTrack>
      </Slider>
    );
  });
});
