import { describe, it } from 'vitest';
import { Input } from '../../../src/components/input/input';
import { expectDeterministicRender } from '../../determinism';

describe('Input - Determinism', () => {
  it('should render deterministic input markup', () => {
    expectDeterministicRender(() => (
      <Input type="email" placeholder="Email" disabled />
    ));
    expectDeterministicRender(() => (
      <Input asChild>
        <div role="textbox">Custom input</div>
      </Input>
    ));
  });
});
