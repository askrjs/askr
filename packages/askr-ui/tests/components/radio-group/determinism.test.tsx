import { describe, it } from 'vitest';
import {
  RadioGroup,
  RadioGroupItem,
} from '../../../src/components/radio-group/radio-group';
import { expectDeterministicRender } from '../../determinism';

describe('RadioGroup - Determinism', () => {
  it('should render deterministic radiogroup markup', () => {
    expectDeterministicRender(() => (
      <RadioGroup defaultValue="m" name="size">
        <RadioGroupItem value="s">Small</RadioGroupItem>
        <RadioGroupItem value="m">Medium</RadioGroupItem>
      </RadioGroup>
    ));
  });
});
