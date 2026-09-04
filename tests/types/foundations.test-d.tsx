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
  ariaDisabled,
  ariaExpanded,
  ariaSelected,
  composeHandlers,
  composeRefs,
  formatId,
  mergeProps,
  setRef,
  type ComposeHandlersOptions,
  type DefaultPreventable,
  type FocusLikeEvent,
  type FormatIdOptions,
  type KeyboardLikeEvent,
  type PointerLikeEvent,
  type PropagationStoppable,
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
  isControlled,
  makeControllable,
  resolveControllable,
  type ControllableState,
} from '@askrjs/askr/foundations/state';
import {
  cloneElement,
  createCollection,
  createLayer,
  isElement,
  type Collection,
  type CollectionItem,
  type Layer,
  type LayerManager,
  type LayerOptions,
} from '@askrjs/askr/foundations/structures';
import {
  IconBase,
  getIconContractProps,
  isIconSizeToken,
  joinIconStyle,
  normalizeIconSizeValue,
  resolveIconSizeVariable,
  resolveIconStrokeWidthVariable,
  serializeIconStyle,
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

const layerManager = createLayer();
expectType<LayerManager>(layerManager);
const layerOptions: LayerOptions = {
  node: document.body,
  onEscape: () => {},
};
expectAssignable<LayerOptions>(layerOptions);
const layer = layerManager.register(layerOptions);
expectAssignable<Layer>(layer);
layerManager.handleEscape();

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
const defaultPreventable: DefaultPreventable = {
  defaultPrevented: false,
  preventDefault: () => {},
};
const focusLikeEvent: FocusLikeEvent = {
  relatedTarget: document.body,
  stopPropagation: () => {},
};
const keyboardLikeEvent: KeyboardLikeEvent = {
  key: 'Enter',
  preventDefault: () => {},
  stopPropagation: () => {},
};
const pointerLikeEvent: PointerLikeEvent = {
  target: document.body,
  preventDefault: () => {},
};
const propagationStoppable: PropagationStoppable = {
  stopPropagation: () => {},
};

expectAssignable<DefaultPreventable>(defaultPreventable);
expectAssignable<FocusLikeEvent>(focusLikeEvent);
expectAssignable<KeyboardLikeEvent>(keyboardLikeEvent);
expectAssignable<PointerLikeEvent>(pointerLikeEvent);
expectAssignable<PropagationStoppable>(propagationStoppable);

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
expectType<{ role: string } & { id: string }>(
  mergeProps({ id: 'a' }, { role: 'button' })
);
expectType<(value: HTMLElement | null) => void>(
  composeRefs<HTMLElement>(callbackRef, objectRef)
);
expectType<void>(setRef<HTMLElement>(objectRef, null));
expectType<string>(formatId(formatIdOptions));
expectType<{ 'aria-disabled'?: 'true' }>(ariaDisabled(true));
expectType<{ 'aria-expanded'?: 'true' | 'false' }>(ariaExpanded(false));
expectType<{ 'aria-selected'?: 'true' | 'false' }>(ariaSelected(true));
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

expectType<boolean>(isControlled<string>('value'));
expectType<{ value: string; isControlled: boolean }>(
  resolveControllable<string>(undefined, 'fallback')
);
const setControllable = makeControllable<string>({
  value: undefined,
  defaultValue: 'fallback',
});
expectType<void>(setControllable.set('next'));
expectError(setControllable.set(42));
const controllable = controllableState<string>({
  value: undefined,
  defaultValue: 'fallback',
});
expectType<ControllableState<string>>(controllable);

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
expectType<string | undefined>(getIconContractProps(iconProps).attrs.style);
declare const possibleSize: unknown;
if (isIconSizeToken(possibleSize)) expectType<IconSizeToken>(possibleSize);
expectType<string>(normalizeIconSizeValue(24));
expectType<string>(resolveIconSizeVariable('md'));
expectType<string>(resolveIconStrokeWidthVariable(2, 'md'));
expectType<string>(serializeIconStyle(iconStyleObject));
expectType<string | undefined>(joinIconStyle('color:red', undefined));
expectError(normalizeIconSizeValue(false));
