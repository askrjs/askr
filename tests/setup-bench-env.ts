const originalScrollTo = globalThis.window?.scrollTo;

if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      writable: true,
      value: () => {},
    });
  } catch {
    try {
      window.scrollTo = () => {};
    } catch {
      // Ignore environments where the property cannot be replaced.
    }
  }
}

void originalScrollTo;