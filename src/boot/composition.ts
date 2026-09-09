import { installRootUpdateHost } from './root-update';
import { ensureRendererBridge, installRendererBridge } from './runtime-wiring';

let rootUpdateHosted = false;

function ensureRootUpdateHost(): void {
  if (rootUpdateHosted) return;
  rootUpdateHosted = true;
  installRootUpdateHost();
}

/**
 * Browser composition root, owned by the boot entry.
 *
 * Wiring a host is composition, not an import side effect of an implementation
 * module: when these calls lived at the top of root-lifecycle.ts, the import
 * order of unrelated modules decided whether a host existed. An entry barrel is
 * where composition belongs, so importing `@askrjs/askr/boot` installs the
 * native renderer — that is the contract consumers rely on.
 */
export function composeBrowserRuntime(): void {
  installRendererBridge();
  ensureRootUpdateHost();
}

/**
 * Compose whatever is still missing, for a mount reached without the boot entry.
 *
 * Non-clobbering: a renderer the consumer configured after composing boot stays
 * installed across mounts.
 */
export function ensureBrowserRuntime(): void {
  ensureRendererBridge();
  ensureRootUpdateHost();
}
