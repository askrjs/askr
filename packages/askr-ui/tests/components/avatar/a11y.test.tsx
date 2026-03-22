import { describe, it } from 'vitest';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '../../../src/components/avatar';
import { expectNoAxeViolations } from '../../accessibility';

describe('Avatar - Accessibility', () => {
  it('should have no automated axe violations given image and fallback', async () => {
    await expectNoAxeViolations(
      <Avatar>
        <AvatarImage src="/avatar.png" alt="Jane Doe" />
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    );
  });
});
