import { describe, it } from 'vite-plus/test';
import { Input } from '../../../src/components/primitives/input/input';
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
