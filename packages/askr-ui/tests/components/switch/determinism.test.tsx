import { describe, it } from 'vitest';
import { Switch } from '../../../src/components/switch/switch';
import { expectDeterministicRender } from '../../determinism';

describe('Switch - Determinism', () => {
  it('should render deterministic switch markup', () => {
    expectDeterministicRender(() => (
      <Switch defaultChecked>Airplane mode</Switch>
    ));
    expectDeterministicRender(() => (
      <Switch asChild disabled>
        <div>Power</div>
      </Switch>
    ));
  });
});
