import { bench, describe } from 'vitest';
import {
  Toast,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '../../src/components/toast';

describe('Toast benches', () => {
  bench('create toast stack', () => {
    ToastProvider({
      children: [
        ToastViewport({}),
        Toast({
          defaultOpen: true,
          children: [ToastTitle({ children: 'Saved' })],
        }),
      ],
    });
  });
});
