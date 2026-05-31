import { expectAssignable, expectError, expectType } from 'tsd';
import {
  For,
  Show,
  derive,
  defineContext,
  getSignal,
  readContext,
  selector,
  state,
  type Derived,
  type ForProps,
  type ShowProps,
  type State,
  type StateSetter,
  type StateTuple,
} from '@askrjs/askr';
import * as rootSurface from '@askrjs/askr';
import {
  Link,
  Outlet,
  currentRoute,
  getManifest,
  getRoutes,
  index,
  navigate,
  page,
  route,
  type LinkProps,
  type PageHelperOptions,
  type PageScopeRecord,
  type RouteMatch,
  type RouteQuery,
  type RouteRecord,
  type RouteSnapshot,
} from '@askrjs/askr/router';
import * as routerSurface from '@askrjs/askr/router';
import { ErrorBoundary } from '@askrjs/askr/components';
import {
  cleanupApp,
  createIsland,
  createIslands,
  createSPA,
  hasApp,
  type IslandConfig,
  type SPAConfig,
} from '@askrjs/askr/boot';
import {
  capture,
  getSignal as resourceGetSignal,
  on,
  resource,
  stream,
  task,
  timer,
  type ResourceResult,
} from '@askrjs/askr/resources';
import * as resourcesSurface from '@askrjs/askr/resources';
import {
  createMutation,
  createQuery,
  invalidate,
  type Mutation,
  type Query,
} from '@askrjs/askr/data';
import {
  debounce,
  debounceEvent,
  defer,
  idle,
  once,
  raf,
  rafEvent,
  retry,
  scheduleEventHandler,
  scheduleIdle,
  scheduleRetry,
  scheduleTimeout,
  throttle,
  throttleEvent,
  timeout,
  type DebounceOptions,
  type RetryOptions,
  type ThrottleOptions,
} from '@askrjs/askr/fx';
import {
  Portal,
  Presence,
  Slot,
  definePortal,
  layout,
  type LayoutComponent,
  type PresenceProps,
  type PortalProps,
  type SlotProps,
} from '@askrjs/askr/foundations';
import * as foundationsSurface from '@askrjs/askr/foundations';
import {
  createCollection,
  createLayer,
  type Collection,
  type LayerManager,
} from '@askrjs/askr/foundations/structures';
import {
  ariaDisabled,
  ariaExpanded,
  ariaSelected,
  composeHandlers,
  composeRefs,
  formatId,
  mergeProps,
  setRef,
} from '@askrjs/askr/foundations/utilities';
import {
  applyInteractionPolicy,
  dismissable,
  focusable,
  hoverable,
  pressable,
  rovingFocus,
  mergeInteractionProps,
} from '@askrjs/askr/foundations/interactions';
import {
  controllableState,
  isControlled,
  makeControllable,
  resolveControllable,
} from '@askrjs/askr/foundations/state';
import {
  IconBase,
  getIconContractProps,
  isIconSizeToken,
  joinIconStyle,
  normalizeIconSizeValue,
  resolveIconSizeVariable,
  resolveIconStrokeWidthVariable,
  serializeIconStyle,
  type IconProps,
} from '@askrjs/askr/foundations/icon';

const count = state(0);
const doubled = derive(() => count() * 2);
expectType<Derived<number>>(doubled);
expectType<number>(doubled());

const [countValue, setCountValue] = state(0);
expectType<State<number>>(countValue);
expectType<StateSetter<number>>(setCountValue);
expectType<StateTuple<number>>(count);

setCountValue((value) => value + 1);
expectType<number>(countValue());

const selectedId = state<number | null>(null);
const isSelected = selector(selectedId);
expectType<boolean>(isSelected(42));

const keyedForProps: ForProps<number> = {
  each: [1, 2, 3],
  by: (item) => item,
  children: (item: number, index: () => number) => {
    expectType<number>(item);
    expectType<number>(index());
    return null as never;
  },
};
expectAssignable<ForProps<number>>(keyedForProps);
For(keyedForProps);

expectError(
  For<number>({
    each: [1, 2, 3],
    by: (item: number) => item,
    byIndex: true,
    children: () => null as never,
  })
);

expectError(
  For<number>({
    each: [1, 2, 3],
    children: () => null as never,
  })
);

const showProps: ShowProps<string | null> = {
  when: 'ready' as string | null,
  children: (value: string) => {
    expectType<string>(value);
    return null as never;
  },
};
expectAssignable<ShowProps<string | null>>(showProps);
Show(showProps);

expectError(
  Show<string | null>({
    when: 'ready' as string | null,
    children: (value: number) => value as never,
  })
);

const ThemeContext = defineContext('light');
expectType<string>(readContext(ThemeContext));
expectType<AbortSignal>(getSignal());

const user = resource(async ({ signal }) => {
  expectType<AbortSignal>(signal);
  return 'ok';
}, []);
expectType<ResourceResult<string>>(user);
expectType<AbortSignal>(resourceGetSignal());

const query = createQuery({
  key: 'user:123',
  fetch: async ({ signal }) => {
    expectType<AbortSignal>(signal);
    return 'ok';
  },
});
expectType<Query<string>>(query);
invalidate('user:');

const mutation = createMutation({
  action: async (input: { id: string }, { signal }) => {
    expectType<AbortSignal>(signal);
    return input.id.length;
  },
});
expectType<Mutation<{ id: string }, number>>(mutation);

const snapshot = currentRoute();
expectType<RouteSnapshot>(snapshot);
expectType<string>(snapshot.path);
expectType<string | null>(snapshot.query.get('q'));
expectType<Readonly<RouteQuery>>(snapshot.query);
expectType<readonly RouteMatch[]>(snapshot.matches);

navigate('/home');
getRoutes();
route('/users/{id}', (params: Record<string, string>) => params.id);
page(
  '/settings',
  () => null,
  () => {
    index(() => null);
    route('billing', () => null);
  }
);

const pageHelperOptions: PageHelperOptions = { auth: true };
expectAssignable<PageHelperOptions>(pageHelperOptions);

const pageScopeRecord: PageScopeRecord = {
  component: () => null,
};
expectAssignable<PageScopeRecord>(pageScopeRecord);

const manifest = getManifest();
expectType<PageScopeRecord[]>(manifest.records[0]!.pageChain);

const routeRecord = manifest.records[0] as RouteRecord;
expectType<PageScopeRecord[]>(routeRecord.pageChain);
expectType<RouteRecord['pageChain']>(routeRecord.pageChain);

const rootLinkProps: LinkProps = { href: '/about' };
Link(rootLinkProps);

expectType<unknown>(Outlet());

const islandConfig: IslandConfig = {
  root: document.body,
  component: () => null,
};
expectAssignable<IslandConfig>(islandConfig);
expectType<void>(createIsland(islandConfig));
expectType<void>(
  createIslands({
    islands: [islandConfig],
  })
);

const spaConfig: SPAConfig = {
  root: document.body,
  routes: [],
};
expectAssignable<SPAConfig>(spaConfig);
expectType<Promise<void>>(createSPA(spaConfig));
expectType<void>(cleanupApp(document.body));
expectType<boolean>(hasApp(document.body));

on(window, 'click', () => {});
timer(1000, () => {});
task(async () => {});
stream<string>('source');
capture(() => 'ok');

const debounceOptions: DebounceOptions = {
  leading: true,
  trailing: false,
};
expectAssignable<DebounceOptions>(debounceOptions);

const throttleOptions: ThrottleOptions = {
  leading: false,
  trailing: true,
};
expectAssignable<ThrottleOptions>(throttleOptions);

const retryOptions: RetryOptions = {
  maxAttempts: 2,
  delayMs: 10,
  backoff: (attemptIndex) => attemptIndex + 1,
};
expectAssignable<RetryOptions>(retryOptions);

const debounced = debounce(
  (value: string) => {
    void value;
  },
  10,
  debounceOptions
);
expectType<((value: string) => void) & { cancel(): void }>(debounced);
debounced('value');
debounced.cancel();

const throttled = throttle(
  (value: string) => {
    void value;
  },
  10,
  throttleOptions
);
expectType<((value: string) => void) & { cancel(): void }>(throttled);
throttled('value');
throttled.cancel();

const onceOnly = once((value: string) => value.length);
expectType<(value: string) => number>(onceOnly);
expectType<number>(onceOnly('value'));

expectType<void>(defer(() => {}));

const rafCallback = raf((value: string) => {
  void value;
});
expectType<(value: string) => void>(rafCallback);
rafCallback('value');

expectType<void>(idle(() => {}, { timeout: 10 }));
expectType<Promise<void>>(timeout(10));
expectType<Promise<number>>(retry(async () => 1, retryOptions));

const debouncedEvent = debounceEvent(10, () => {}, debounceOptions);
expectType<EventListener & { cancel(): void; flush(): void }>(debouncedEvent);
debouncedEvent(new Event('click'));
debouncedEvent.cancel();
debouncedEvent.flush();

const throttledEvent = throttleEvent(10, () => {}, throttleOptions);
expectType<EventListener & { cancel(): void }>(throttledEvent);
throttledEvent(new Event('click'));
throttledEvent.cancel();

const rafListener = rafEvent(() => {});
expectType<EventListener & { cancel(): void }>(rafListener);
rafListener(new Event('click'));
rafListener.cancel();

const cancelTimeout = scheduleTimeout(10, () => {});
expectType<() => void>(cancelTimeout);
cancelTimeout();

const cancelIdle = scheduleIdle(() => {}, { timeout: 10 });
expectType<() => void>(cancelIdle);
cancelIdle();

const scheduledRetry = scheduleRetry(async () => 1, retryOptions);
expectType<{ cancel(): void }>(scheduledRetry);
scheduledRetry.cancel();

expectType<EventListener>(scheduleEventHandler(() => {}));

expectType<typeof ErrorBoundary>(ErrorBoundary);

const layoutComponent: LayoutComponent<{ title: string }> = ({ children }) =>
  children;
expectAssignable<LayoutComponent<{ title: string }>>(layoutComponent);
expectAssignable<SlotProps>({ children: 'slot' });
expectAssignable<PresenceProps>({ present: true });
expectAssignable<PortalProps>({ children: 'portal' });

const portal = definePortal<string>();
expectType<unknown>(portal());
expectType<typeof Portal>(Portal);
layout(layoutComponent)('body', { title: 'page' });
Slot({ children: 'x' });
Presence({ present: true, children: 'x' });

const collection = createCollection<HTMLElement, { disabled: boolean }>();
expectType<Collection<HTMLElement, { disabled: boolean }>>(collection);
const unregister = collection.register(document.body, { disabled: false });
expectType<() => void>(unregister);

const layerManager = createLayer();
expectType<LayerManager>(layerManager);
layerManager.handleEscape();

expectType<typeof composeHandlers>(composeHandlers);
expectType<typeof mergeProps>(mergeProps);
expectType<typeof composeRefs>(composeRefs);
expectType<typeof setRef>(setRef);
expectType<typeof formatId>(formatId);
expectType<typeof ariaDisabled>(ariaDisabled);
expectType<typeof ariaExpanded>(ariaExpanded);
expectType<typeof ariaSelected>(ariaSelected);

composeHandlers();
mergeProps({ id: 'a' }, { role: 'button' });
composeRefs<HTMLElement>();
setRef<HTMLElement>(null, null);
formatId({ id: 'demo' });
ariaDisabled(true);
ariaExpanded(false);
ariaSelected(true);

expectType<typeof pressable>(pressable);
expectType<typeof dismissable>(dismissable);
expectType<typeof focusable>(focusable);
expectType<typeof hoverable>(hoverable);
expectType<typeof rovingFocus>(rovingFocus);
expectType<typeof applyInteractionPolicy>(applyInteractionPolicy);
expectType<typeof mergeInteractionProps>(mergeInteractionProps);

pressable({ onPress: () => {} });
dismissable({});
focusable({});
hoverable({});
rovingFocus({ currentIndex: 0, itemCount: 1 });
applyInteractionPolicy({
  isNative: true,
  disabled: false,
  onPress: () => {},
});
mergeInteractionProps({}, {}, {});

expectType<typeof isControlled>(isControlled);
expectType<typeof resolveControllable>(resolveControllable);
expectType<typeof makeControllable>(makeControllable);
expectType<typeof controllableState>(controllableState);

isControlled<string>('value');
resolveControllable<string>(undefined, 'fallback');
makeControllable<string>({
  value: undefined,
  defaultValue: 'fallback',
});
controllableState<string>({
  value: undefined,
  defaultValue: 'fallback',
});

expectType<typeof IconBase>(IconBase);
expectType<typeof getIconContractProps>(getIconContractProps);
expectType<typeof isIconSizeToken>(isIconSizeToken);
expectType<typeof normalizeIconSizeValue>(normalizeIconSizeValue);
expectType<typeof resolveIconSizeVariable>(resolveIconSizeVariable);
expectType<typeof resolveIconStrokeWidthVariable>(
  resolveIconStrokeWidthVariable
);
expectType<typeof serializeIconStyle>(serializeIconStyle);
expectType<typeof joinIconStyle>(joinIconStyle);

const iconProps: IconProps = {
  iconName: 'demo',
  children: null,
};
expectAssignable<IconProps>(iconProps);

// @ts-expect-error root package does not expose startup helpers
rootSurface.createIsland;
// @ts-expect-error root package does not expose router helpers
rootSurface.route;
// @ts-expect-error root package does not expose resource helpers
rootSurface.resource;
// @ts-expect-error root package does not expose component helpers
rootSurface.ErrorBoundary;
// @ts-expect-error root package does not expose data helpers
rootSurface.createQuery;
// @ts-expect-error root package does not expose foundations helpers
rootSurface.Portal;

// @ts-expect-error resources subpath no longer re-exports data helpers
resourcesSurface.createQuery;
// @ts-expect-error resources subpath no longer re-exports data helpers
resourcesSurface.createMutation;
// @ts-expect-error resources subpath no longer re-exports data helpers
resourcesSurface.invalidate;
// @ts-expect-error resources subpath no longer re-exports removed aliases
resourcesSurface.DataResult;

// @ts-expect-error slim foundations entrypoint no longer exposes utilities
foundationsSurface.composeHandlers;
// @ts-expect-error slim foundations entrypoint no longer exposes interactions
foundationsSurface.pressable;
// @ts-expect-error slim foundations entrypoint no longer exposes state helpers
foundationsSurface.isControlled;
// @ts-expect-error slim foundations entrypoint no longer exposes icon helpers
foundationsSurface.IconBase;
// @ts-expect-error slim foundations entrypoint no longer exposes structural registries
foundationsSurface.createCollection;
// @ts-expect-error slim foundations entrypoint no longer exposes structural registries
foundationsSurface.createLayer;

// @ts-expect-error internal router helpers are not part of the public barrel
routerSurface._applyManifest;
// @ts-expect-error internal router helpers are not part of the public barrel
routerSurface._drainLazy;
// @ts-expect-error internal router helpers are not part of the public barrel
routerSurface.getNamespaceRoutes;
// @ts-expect-error internal router helpers are not part of the public barrel
routerSurface.unloadNamespace;
// @ts-expect-error internal router helpers are not part of the public barrel
routerSurface.getLoadedNamespaces;
// @ts-expect-error internal router helpers are not part of the public barrel
routerSurface.resolveRouteRequest;
// @ts-expect-error internal router helpers are not part of the public barrel
routerSurface.setServerLocation;
