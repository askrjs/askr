import './styles.css';
import {
  ToastProvider,
  Toast,
  ToastClose,
  ToastDescription,
  ToastTitle,
  ToastViewport,
} from '@askrjs/askr-ui/toast';
import {
  clearToast,
  bindToast,
  setToastOpen,
  toastMessage,
  toastOpen,
} from './toast';
import { state } from '@askrjs/askr';

export default function App({ children }: { children?: unknown }) {
  const messageState = state(toastMessage());
  const openState = state(toastOpen());

  bindToast({
    setMessage: messageState.set,
    setOpen: openState.set,
  });

  return (
    <ToastProvider duration={2400}>
      <div class="app-root">{children}</div>

      <ToastViewport class="app-toast-viewport" />
      {messageState() && (
        <Toast
          open={openState()}
          onOpenChange={(open) => {
            setToastOpen(open);
            if (!open) {
              clearToast();
            }
          }}
          class="app-toast"
        >
          <ToastTitle>{messageState().title}</ToastTitle>
          {messageState().description && (
            <ToastDescription>{messageState().description}</ToastDescription>
          )}
          <ToastClose aria-label="Dismiss notification">Dismiss</ToastClose>
        </Toast>
      )}
    </ToastProvider>
  );
}
