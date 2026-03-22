import { describe, it } from 'vitest';
import { Textarea } from '../../../src/components/textarea/textarea';
import { expectDeterministicRender } from '../../determinism';

describe('Textarea - Determinism', () => {
  it('should render deterministic textarea markup', () => {
    expectDeterministicRender(() => <Textarea rows={4}>Notes</Textarea>);
    expectDeterministicRender(() => (
      <Textarea asChild>
        <div role="textbox">Custom notes</div>
      </Textarea>
    ));
  });
});
