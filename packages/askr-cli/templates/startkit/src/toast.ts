import { state } from '@askrjs/askr';

export type AppToast = {
  title: string;
  description?: string;
};

export const [toastMessage, setToastMessage] = state<AppToast | null>(null);
export const [toastOpen, setToastOpen] = state(false);

export function showToast(message: AppToast) {
  setToastMessage(message);
  setToastOpen(false);
  queueMicrotask(() => setToastOpen(true));
}

export function clearToast() {
  setToastOpen(false);
  setToastMessage(null);
}
