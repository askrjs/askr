import { describe, it } from 'vitest';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '../../../src/components/avatar';
import { expectDeterministicRender } from '../../determinism';

describe('Avatar - Determinism', () => {
  it('should render deterministic avatar markup', () => {
    expectDeterministicRender(() => (
      <Avatar>
        <AvatarImage src="/avatar.png" alt="Jane Doe" />
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    ));
  });
});
