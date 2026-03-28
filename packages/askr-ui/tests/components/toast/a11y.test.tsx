import { describe, it } from 'vite-plus/test';
import {
  Toast,
  ToastAction,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '../../../src/components/composites/toast';
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
