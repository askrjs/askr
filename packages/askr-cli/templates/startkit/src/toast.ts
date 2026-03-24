export type AppToast = {
  title: string;
  description?: string;
};

type ToastBindings = {
  setMessage: (message: AppToast | null) => void;
  setOpen: (open: boolean) => void;
};

let toastMessageValue: AppToast | null = null;
let toastOpenValue = false;
let toastBindings: ToastBindings | null = null;

export function bindToast(bindings: ToastBindings) {
  toastBindings = bindings;
}

export function toastMessage() {
  return toastMessageValue;
}

export function toastOpen() {
  return toastOpenValue;
}

function syncToastBindings() {
  if (!toastBindings) {
    return;
  }

  toastBindings.setMessage(toastMessageValue);
  toastBindings.setOpen(toastOpenValue);
}

export function setToastMessage(message: AppToast | null) {
  toastMessageValue = message;
  syncToastBindings();
}

export function setToastOpen(open: boolean) {
  toastOpenValue = open;
  syncToastBindings();
}

export function showToast(message: AppToast) {
  setToastMessage(message);
  setToastOpen(false);
  queueMicrotask(() => setToastOpen(true));
}

export function clearToast() {
  setToastOpen(false);
  setToastMessage(null);
}
