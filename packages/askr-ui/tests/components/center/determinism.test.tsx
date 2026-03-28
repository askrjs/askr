import { describe, it } from 'vite-plus/test';
import { Center } from '../../../src/components/primitives/center/center';
import { expectDeterministicRender } from '../../determinism';

describe('Center - Determinism', () => {
  it('should render deterministic center markup', () => {
    expectDeterministicRender(() => <Center axis="both">Content</Center>);
    expectDeterministicRender(() => (
      <Center axis="vertical" minHeight="100vh" />
    ));
    expectDeterministicRender(() => <Center inline axis="horizontal" />);
  });
});
