import { describe, it } from 'vitest';
import {
  Toast,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '../../../src/components/toast';
import { expectDeterministicRender } from '../../determinism';

describe('Toast - Determinism', () => {
  it('renders deterministic toast markup', () => {
    expectDeterministicRender(() => (
      <ToastProvider>
        <ToastViewport />
        <Toast defaultOpen={true}>
          <ToastTitle>Saved</ToastTitle>
        </Toast>
      </ToastProvider>
    ));
  });
});
