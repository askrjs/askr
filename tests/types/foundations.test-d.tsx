import { expectAssignable, expectType } from 'tsd';
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
  createCollection,
  createLayer,
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
expectAssignable<PresenceProps>({ present: true });
expectAssignable<PortalProps>({ children: 'portal' });

const portal = definePortal<string>();
expectType<unknown>(portal());
expectType<unknown>(DefaultPortal());
expectType<unknown>(DefaultPortal.render({ children: 'toast' }));
expectType<typeof Portal>(Portal);
layout(layoutComponent)('body', { title: 'page' });
expectAssignable<JSXElement | null>(Slot({ children: 'x' }));
expectAssignable<JSXElement | null>(Presence({ present: true, children: 'x' }));

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

expectType<typeof composeHandlers>(composeHandlers);
expectType<typeof mergeProps>(mergeProps);
expectType<typeof composeRefs>(composeRefs);
expectType<typeof setRef>(setRef);
expectType<typeof formatId>(formatId);
expectType<typeof ariaDisabled>(ariaDisabled);
expectType<typeof ariaExpanded>(ariaExpanded);
expectType<typeof ariaSelected>(ariaSelected);

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

composeHandlers(undefined, undefined, composeHandlersOptions);
mergeProps({ id: 'a' }, { role: 'button' });
composeRefs<HTMLElement>(callbackRef, objectRef);
setRef<HTMLElement>(objectRef, null);
formatId(formatIdOptions);
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
const controllable = controllableState<string>({
  value: undefined,
  defaultValue: 'fallback',
});
expectType<ControllableState<string>>(controllable);

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
