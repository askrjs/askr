import { installRootUpdateHost } from './root-update';

let composed = false;

/**
 * Browser composition root, owned by the boot entry: connects route updates
 * from the router to application roots.
 */
export function composeBrowserRuntime(): void {
  if (composed) return;
  composed = true;
  installRootUpdateHost();
}

/** Compose whatever is still missing, for a mount reached without the boot entry. */
export function ensureBrowserRuntime(): void {
  composeBrowserRuntime();
}
