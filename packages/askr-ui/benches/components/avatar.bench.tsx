import { bench, describe } from 'vitest';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '../../src/components/avatar';

describe('Avatar benches', () => {
  bench('create avatar', () => {
    Avatar({
      children: [
        AvatarImage({ src: '/avatar.png', alt: 'Jane Doe' }),
        AvatarFallback({ children: 'JD' }),
      ],
    });
  });
});
