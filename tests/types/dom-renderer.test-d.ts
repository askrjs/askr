import { expectType, expectError } from 'tsd';
import {
  createDOMRendererHost,
  createRuntime,
  type DOMComponentOwner,
  type DOMChildScope,
  type DOMReactiveSource,
  type DOMRendererRange,
  type RuntimeRendererHost,
} from '@askrjs/askr';
import type {
  DOMRendererHost,
  DOMRendererEvaluation,
  DOMRendererCleanup,
  DOMRendererScopes,
  DOMRendererKeys,
  DOMRendererReactivity,
} from '@askrjs/askr';
declare const roles: DOMRendererHost;
expectType<DOMRendererEvaluation>(roles.evaluation);
expectType<DOMRendererCleanup>(roles.cleanup);
expectType<DOMRendererScopes>(roles.scopes);
expectType<DOMRendererKeys>(roles.keys);
expectType<DOMRendererReactivity>(roles.reactivity);

const host = createDOMRendererHost((native) => ({ ...native }));
expectType<RuntimeRendererHost>(host);
createRuntime({ renderer: host }).configureRenderer(host);
expectError(createDOMRendererHost(() => ({})));
declare const owner: DOMComponentOwner;
declare const scope: DOMChildScope;
declare const source: DOMReactiveSource;
declare const element: Element;
createDOMRendererHost((native) => {
  expectError(native.evaluation.replaceComponentRange({}, null, element));
  expectError(native.evaluation.replaceComponentRange(scope, null, element));
  expectError(native.scopes.resolveChildScopeRange(owner));
  expectError(native.reactivity.markReactivePropsDirtySource(owner));
  native.reactivity.markReactivePropsDirtySource(source);
  expectType<DOMRendererRange | null>(
    native.scopes.resolveChildScopeRange(scope)
  );
  return native;
});
declare const range: DOMRendererRange;
expectType<Node>(range.start);
expectType<boolean>(range.single);
expectError((range.start = element));
