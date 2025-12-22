// Lightweight shared no-op helpers to avoid double-casts and duplicated definitions

export const noop: () => void = () => {};

export const noopEventListener: EventListener & { cancel(): void } =
  Object.assign((_ev?: Event) => {}, { cancel() {} });

export const noopEventListenerWithFlush: EventListener & {
  cancel(): void;
  flush(): void;
} = Object.assign((_ev?: Event) => {}, { cancel() {}, flush() {} });

export const noopCancel: { cancel(): void } = { cancel() {} };
