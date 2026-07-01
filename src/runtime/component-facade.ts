export type {
  ComponentFunction,
  ComponentInstance,
} from './component-internal';
export {
  captureInlineRenderSnapshot,
  cleanupComponent,
  commitRenderedComponent,
  createComponentInstance,
  executeComponent,
  finalizeReadSubscriptions,
  mountComponent,
  mountInstanceInline,
  registerCommitOperation,
  registerMountOperation,
  registerOwnedChildScope,
  renderComponentInline,
  renderScopedComponent,
  unregisterOwnedChildScope,
  warnUnusedStateReads,
} from './component-internal';
export {
  claimHookIndex,
  getCurrentComponentInstance,
  getCurrentInstance,
  getCurrentPortalScope,
  getCurrentStateIndex,
  getNextStateIndex,
  getSignal,
  resetStateIndex,
  setCurrentComponentInstance,
  setStateIndex,
} from './component-scope';
