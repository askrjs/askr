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
  const [message, setMessage] = state(toastMessage());
  const [open, setOpen] = state(toastOpen());

  bindToast({
    setMessage,
    setOpen,
  });

  return (
    <ToastProvider duration={2400}>
      <div class="app-root">{children}</div>

      <ToastViewport class="app-toast-viewport" />
      {message && (
        <Toast
          open={open()}
          onOpenChange={(open) => {
            setToastOpen(open);
            if (!open) {
              clearToast();
            }
          }}
          class="app-toast"
        >
          <ToastTitle>{message.title}</ToastTitle>
          {message.description && (
            <ToastDescription>{message.description}</ToastDescription>
          )}
          <ToastClose aria-label="Dismiss notification">Dismiss</ToastClose>
        </Toast>
      )}
    </ToastProvider>
  );
}
