import { describe, it } from 'vite-plus/test';
import { Textarea } from '../../../src/components/primitives/textarea/textarea';
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
