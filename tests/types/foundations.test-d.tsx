import { expectAssignable, expectError, expectType } from 'tsd';
import {
  DefaultPortal,
  Portal,
  Presence,
  Slot,
  definePortal,
  layout,
  type JSXElement,
  type LayoutComponent,
  type PortalProps,
  type PresenceProps,
  type SlotProps,
} from '@askrjs/askr/foundations';
import {
  composeHandlers,
  composeRefs,
  formatId,
  mergeProps,
  type MergedProps,
  setRef,
  type ComposeHandlersOptions,
  type FormatIdOptions,
  type Ref,
} from '@askrjs/askr/foundations/utilities';
import {
  applyInteractionPolicy,
  dismissable,
  focusable,
  hoverable,
  mergeInteractionProps,
  pressable,
  rovingFocus,
  type DismissableOptions,
  type FocusableOptions,
  type FocusableResult,
  type HoverableOptions,
  type HoverableResult,
  type InteractionPolicyInput,
  type Orientation,
  type PressableOptions,
  type PressableResult,
  type RovingFocusOptions,
  type RovingFocusResult,
} from '@askrjs/askr/foundations/interactions';
import {
  controllableState,
  type ControllableState,
} from '@askrjs/askr/foundations/state';
import {
  cloneElement,
  createCollection,
  isElement,
  type Collection,
  type CollectionItem,
} from '@askrjs/askr/foundations/structures';
import {
  IconBase,
  type IconOwnProps,
  type IconProps,
  type IconSizeToken,
  type IconStyleObject,
} from '@askrjs/askr/foundations/icon';

const layoutComponent: LayoutComponent<{ title: string }> = ({ children }) =>
  children;
expectAssignable<LayoutComponent<{ title: string }>>(layoutComponent);

expectAssignable<SlotProps>({ children: 'slot' });
expectAssignable<SlotProps>({
  children: [<span key="first">slot</span>, <span key="second">content</span>],
});
expectAssignable<PresenceProps>({ present: true });
expectAssignable<PresenceProps>({
  present: true,
  children: [<span key="first">toast</span>, <span key="second">body</span>],
});
expectAssignable<PortalProps>({ children: 'portal' });
expectAssignable<PortalProps>({
  children: [<span key="first">portal</span>, <span key="second">host</span>],
});

const portal = definePortal<string>();
const defaultPortal = definePortal();
const StringPortal = portal;
expectType<string | JSXElement | null | undefined>(portal());
expectAssignable<JSXElement>(<StringPortal />);
expectAssignable<JSXElement>(<DefaultPortal />);
expectType<unknown>(DefaultPortal.render({ children: 'toast' }));
expectType<JSXElement | null>(Portal({ children: 'toast' }));
layout(layoutComponent)('body', { title: 'page' });
layout(layoutComponent)(
  [<span key="first">body</span>, <span key="second">copy</span>],
  { title: 'page' }
);
expectAssignable<JSXElement | null>(Slot({ children: 'x' }));
expectAssignable<JSXElement | null>(Presence({ present: true, children: 'x' }));
expectAssignable<JSXElement | null>(
  Presence({
    present: true,
    children: [<span key="first">x</span>, <span key="second">y</span>],
  })
);

expectError(Slot({ children: document.createElement('div') }));
expectError(
  Presence({ present: true, children: document.createElement('div') })
);
expectError(Portal({ children: document.createElement('div') }));
expectError(DefaultPortal.render({ children: document.createElement('div') }));
expectError(defaultPortal.render({ children: document.createElement('div') }));
const cloned = cloneElement(<span>clone</span>, { title: 'cloned' });
expectType<JSXElement>(cloned);
expectType<boolean>(isElement(cloned));
expectError(
  layout(layoutComponent)(document.createElement('div'), { title: 'page' })
);
expectError(definePortal<Node>());

const collection = createCollection<HTMLElement, { disabled: boolean }>();
expectType<Collection<HTMLElement, { disabled: boolean }>>(collection);
const unregister = collection.register(document.body, { disabled: false });
expectType<() => void>(unregister);
expectType<ReadonlyArray<CollectionItem<HTMLElement, { disabled: boolean }>>>(
  collection.items()
);

const composeHandlersOptions: ComposeHandlersOptions = {
  checkDefaultPrevented: false,
};
expectAssignable<ComposeHandlersOptions>(composeHandlersOptions);
const callbackRef: Ref<HTMLElement> = (value) => {
  expectType<HTMLElement | null>(value);
};
const objectRef: Ref<HTMLElement> = { current: document.body };
const unknownRef: Ref<unknown> = (_value) => {};
const formatIdOptions: FormatIdOptions = { id: 'demo', prefix: 'scope' };
expectAssignable<FormatIdOptions>(formatIdOptions);
expectType<(event: MouseEvent) => void>(
  composeHandlers(
    (event: MouseEvent) => {
      expectType<number>(event.clientX);
    },
    (event) => {
      expectType<MouseEvent>(event);
    },
    composeHandlersOptions
  )
);
const mergedDisjoint = mergeProps({ id: 'a' }, { role: 'button' });
expectType<string>(mergedDisjoint.id);
expectType<string>(mergedDisjoint.role);
expectType<(value: HTMLElement | null) => void>(
  composeRefs<HTMLElement>(callbackRef, objectRef)
);
expectType<void>(setRef<HTMLElement>(objectRef, null));
expectType<string>(formatId(formatIdOptions));
expectError(formatId({ id: {} }));
expectError(setRef<HTMLElement>(objectRef, 'element'));

const pressableOptions: PressableOptions = { onPress: () => {} };
expectAssignable<PressableOptions>(pressableOptions);
expectType<PressableResult>(pressable(pressableOptions));

const dismissableOptions: DismissableOptions = {
  node: document.body,
  onDismiss: (trigger) => {
    expectType<'escape' | 'outside'>(trigger);
  },
};
expectAssignable<DismissableOptions>(dismissableOptions);

const focusableOptions: FocusableOptions = { tabIndex: 2 };
expectAssignable<FocusableOptions>(focusableOptions);
expectType<FocusableResult>(focusable(focusableOptions));

const hoverableOptions: HoverableOptions = {
  onEnter: () => {},
  onLeave: () => {},
};
expectAssignable<HoverableOptions>(hoverableOptions);
expectType<HoverableResult>(hoverable(hoverableOptions));

const orientation: Orientation = 'both';
expectAssignable<Orientation>(orientation);
const rovingFocusOptions: RovingFocusOptions = {
  currentIndex: 0,
  itemCount: 1,
  orientation,
};
expectAssignable<RovingFocusOptions>(rovingFocusOptions);
expectType<RovingFocusResult>(rovingFocus(rovingFocusOptions));

const interactionPolicyInput: InteractionPolicyInput = {
  isNative: true,
  disabled: false,
  onPress: () => {},
  ref: unknownRef,
};
expectAssignable<InteractionPolicyInput>(interactionPolicyInput);

dismissable(dismissableOptions);
focusable(focusableOptions);
hoverable(hoverableOptions);
applyInteractionPolicy(interactionPolicyInput);
mergeInteractionProps({}, {}, {});

const controllable = controllableState<string>({
  value: undefined,
  defaultValue: 'fallback',
});
expectType<ControllableState<string>>(controllable);
const [controlledValue, setControlledValue] = controllable;
expectType<string>(controlledValue());
setControlledValue('next');

const iconSizeToken: IconSizeToken = 'md';
const iconStyleObject: IconStyleObject = { color: 'red' };
const iconOwnProps: IconOwnProps = {
  size: iconSizeToken,
  style: iconStyleObject,
};
expectAssignable<IconOwnProps>(iconOwnProps);

const iconProps: IconProps = {
  iconName: 'demo',
  children: null,
};
expectAssignable<IconProps>(iconProps);
expectType<JSXElement>(IconBase(iconProps));

// Base values win; an `undefined` base value keeps the injected one.
const mergedOverride = mergeProps(
  { 'aria-expanded': undefined, role: undefined, id: 'user-id' },
  { 'aria-expanded': 'false', role: 'menuitem', id: 'generated-id' }
);
expectType<string>(mergedOverride['aria-expanded']);
expectType<string>(mergedOverride.role);
expectType<string>(mergedOverride.id);
// A base value that may be undefined falls back to the injected type.
declare const maybeLabel: string | undefined;
expectType<string | number>(
  mergeProps({ label: maybeLabel }, { label: 1 as number }).label
);

// An untyped base value (JSON.parse returns `any`) keeps its value type.
declare const untypedValue: ReturnType<typeof JSON.parse>;
expectType<ReturnType<typeof JSON.parse>>(
  mergeProps({ x: untypedValue }, {}).x
);
// An optional base key is required when the injected side always has it.
declare const partial: { id?: string };
expectType<string>(mergeProps(partial, { id: 'generated' }).id);
// Index-signature props keep the injected handler types.
declare const rest: Record<string, unknown>;
const forwarded = mergeProps(rest, {
  onClick: (_event: MouseEvent) => undefined,
  role: 'button' as const,
});
expectType<'button'>(forwarded.role);
expectAssignable<(event: MouseEvent) => undefined>(forwarded.onClick);
expectType<MergedProps<{ id: string }, { role: string }>>(mergedDisjoint);
