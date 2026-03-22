import { describe, it } from 'vitest';
import {
  Toast,
  ToastAction,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '../../../src/components/toast';
import { expectNoAxeViolations } from '../../accessibility';

describe('Toast - Accessibility', () => {
  it('has no toast accessibility regressions', async () => {
    await expectNoAxeViolations(
      <ToastProvider>
        <ToastViewport />
        <Toast defaultOpen={true}>
          <ToastTitle>Saved</ToastTitle>
          <ToastDescription>Changes stored</ToastDescription>
          <ToastAction>Undo</ToastAction>
        </Toast>
      </ToastProvider>
    );
  });
});
