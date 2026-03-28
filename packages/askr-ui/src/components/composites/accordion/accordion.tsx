import { state } from '@askrjs/askr';
import {
  Presence,
  Slot,
  composeRefs,
  controllableState,
  mergeProps,
  pressable,
  rovingFocus,
} from '@askrjs/askr/foundations';
import { focusSelectedCollectionItem } from '../../_internal/focus';
import {
  disabledIndexes,
  firstEnabledCompositeIndex,
  getCompositeCollection,
  registerCompositeNode,
} from '../../_internal/composite';
import {
  isDisclosureValueOpen,
  toggleDisclosureValue,
} from '../../_internal/disclosure';
import { resolveCompoundId, resolvePartId } from '../../_internal/id';
import { collectJsxElements, mapJsxTree } from '../../_internal/jsx';
import type {
  AccordionContentAsChildProps,
  AccordionContentProps,
  AccordionHeaderAsChildProps,
  AccordionHeaderProps,
  AccordionItemProps,
  AccordionMultipleProps,
  AccordionProps,
  AccordionSingleProps,
  AccordionTriggerAsChildProps,
  AccordionTriggerProps,
} from './accordion.types';

type AccordionRootInjectedProps = {
  __accordionId?: string;
  __type?: 'single' | 'multiple';
  __value?: string | string[];
  __setValue?: (value: string | string[]) => void;
  __orientation?: 'vertical' | 'horizontal';
  __loop?: boolean;
  __collapsible?: boolean;
  __currentIndex?: number;
  __setCurrentIndex?: (index: number) => void;
  __disabledIndexes?: number[];
  __itemCount?: number;
};

type AccordionItemInjectedProps = AccordionRootInjectedProps & {
  __itemValue?: string;
  __itemIndex?: number;
  __itemDisabled?: boolean;
  __itemId?: string;
  __triggerId?: string;
  __contentId?: string;
};

function readAccordionRootInjectedProps(
  props: AccordionRootInjectedProps
): Required<AccordionRootInjectedProps> {
  if (
    !props.__accordionId ||
    !props.__type ||
    props.__value === undefined ||
    !props.__setValue ||
    !props.__orientation ||
    props.__loop === undefined ||
    props.__collapsible === undefined ||
    props.__currentIndex === undefined ||
    !props.__setCurrentIndex ||
    !props.__disabledIndexes ||
    props.__itemCount === undefined
  ) {
    throw new Error('Accordion components must be used within <Accordion>');
  }

  return {
    __accordionId: props.__accordionId,
    __type: props.__type,
    __value: props.__value,
    __setValue: props.__setValue,
    __orientation: props.__orientation,
    __loop: props.__loop,
    __collapsible: props.__collapsible,
    __currentIndex: props.__currentIndex,
    __setCurrentIndex: props.__setCurrentIndex,
    __disabledIndexes: props.__disabledIndexes,
    __itemCount: props.__itemCount,
  };
}

function readAccordionItemInjectedProps(
  props: AccordionItemInjectedProps
): Required<AccordionItemInjectedProps> {
  const injected = readAccordionRootInjectedProps(props);

  if (
    !props.__itemValue ||
    props.__itemIndex === undefined ||
    props.__itemDisabled === undefined ||
    !props.__itemId ||
    !props.__triggerId ||
    !props.__contentId
  ) {
    throw new Error('AccordionItem must be used within <Accordion>');
  }

  return {
    ...injected,
    __itemValue: props.__itemValue,
    __itemIndex: props.__itemIndex,
    __itemDisabled: props.__itemDisabled,
    __itemId: props.__itemId,
    __triggerId: props.__triggerId,
    __contentId: props.__contentId,
  };
}

function createAccordionValueState(props: AccordionProps) {
  if (props.type === 'multiple') {
    const multipleProps = props as AccordionMultipleProps;
    return controllableState({
      value: multipleProps.value,
      defaultValue: multipleProps.defaultValue ?? [],
      onChange: multipleProps.onValueChange,
    });
  }

  const singleProps = props as AccordionSingleProps;
  return controllableState({
    value: singleProps.value,
    defaultValue: singleProps.defaultValue ?? '',
    onChange: singleProps.onValueChange,
  });
}

export function Accordion(props: AccordionProps) {
  const {
    children,
    collapsible = false,
    id,
    loop = true,
    orientation = 'vertical',
    ref,
    type = 'single',
    ...rest
  } = props;
  const accordionId = resolveCompoundId('accordion', id, children);
  const items = collectJsxElements(
    children,
    (element) => element.type === AccordionItem
  ).map((element) => ({
    value: element.props?.value as string,
    disabled: Boolean(element.props?.disabled),
  }));
  const valueState = createAccordionValueState(props);
  const currentOpenIndex = items.findIndex((item) =>
    isDisclosureValueOpen(type, valueState(), item.value)
  );
  const currentIndexState = state(
    currentOpenIndex >= 0 ? currentOpenIndex : firstEnabledCompositeIndex(items)
  );
  const currentIndex = items[currentIndexState()]
    ? currentIndexState()
    : firstEnabledCompositeIndex(items);
  let itemIndex = 0;
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (element.type !== AccordionItem) {
      return element;
    }

    const index = itemIndex;
    itemIndex += 1;
    const itemValue = element.props?.value as string;
    const itemId = resolvePartId(accordionId, `item-${index}`);

    return {
      ...element,
      props: {
        ...element.props,
        __accordionId: accordionId,
        __type: type,
        __value: valueState(),
        __setValue: valueState.set,
        __orientation: orientation,
        __loop: loop,
        __collapsible: collapsible,
        __currentIndex: currentIndex,
        __setCurrentIndex: currentIndexState.set,
        __disabledIndexes: disabledIndexes(items),
        __itemCount: items.length,
        __itemValue: itemValue,
        __itemIndex: index,
        __itemDisabled: Boolean(element.props?.disabled),
        __itemId: itemId,
        __triggerId: resolvePartId(itemId, 'trigger'),
        __contentId: resolvePartId(itemId, 'content'),
      },
    };
  });
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'accordion',
    'data-accordion': 'true',
    'data-orientation': orientation,
  });

  return <div {...finalProps}>{enhancedChildren}</div>;
}

export function AccordionItem(
  props: AccordionItemProps & AccordionItemInjectedProps
) {
  const {
    children,
    ref,
    __accordionId,
    __type,
    __value,
    __setValue,
    __orientation,
    __loop,
    __collapsible,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    __itemValue,
    __itemIndex,
    __itemDisabled,
    __itemId,
    __triggerId,
    __contentId,
    ...rest
  } = props;
  const injected = readAccordionItemInjectedProps({
    __accordionId,
    __type,
    __value,
    __setValue,
    __orientation,
    __loop,
    __collapsible,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    __itemValue,
    __itemIndex,
    __itemDisabled,
    __itemId,
    __triggerId,
    __contentId,
  });
  const open = isDisclosureValueOpen(
    injected.__type,
    injected.__value,
    injected.__itemValue
  );
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (
      element.type !== AccordionHeader &&
      element.type !== AccordionTrigger &&
      element.type !== AccordionContent
    ) {
      return element;
    }

    return {
      ...element,
      props: {
        ...element.props,
        ...injected,
      },
    };
  });
  const finalProps = mergeProps(rest, {
    ref,
    id: injected.__itemId,
    'data-slot': 'accordion-item',
    'data-state': open ? 'open' : 'closed',
    'data-disabled': injected.__itemDisabled ? 'true' : undefined,
    'data-orientation': injected.__orientation,
  });

  return <div {...finalProps}>{enhancedChildren}</div>;
}

export function AccordionHeader(props: AccordionHeaderProps): JSX.Element;
export function AccordionHeader(
  props: AccordionHeaderAsChildProps
): JSX.Element;
export function AccordionHeader(
  props:
    | (AccordionHeaderProps & AccordionItemInjectedProps)
    | (AccordionHeaderAsChildProps & AccordionItemInjectedProps)
) {
  const {
    asChild,
    children,
    ref,
    __accordionId,
    __type,
    __value,
    __setValue,
    __orientation,
    __loop,
    __collapsible,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    __itemValue,
    __itemIndex,
    __itemDisabled,
    __itemId,
    __triggerId,
    __contentId,
    ...rest
  } = props;
  readAccordionItemInjectedProps({
    __accordionId,
    __type,
    __value,
    __setValue,
    __orientation,
    __loop,
    __collapsible,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    __itemValue,
    __itemIndex,
    __itemDisabled,
    __itemId,
    __triggerId,
    __contentId,
  });
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'accordion-header',
    'data-accordion-header': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <h3 {...finalProps}>{children}</h3>;
}

export function AccordionTrigger(props: AccordionTriggerProps): JSX.Element;
export function AccordionTrigger(
  props: AccordionTriggerAsChildProps
): JSX.Element;
export function AccordionTrigger(
  props:
    | (AccordionTriggerProps & AccordionItemInjectedProps)
    | (AccordionTriggerAsChildProps & AccordionItemInjectedProps)
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __accordionId,
    __type,
    __value,
    __setValue,
    __orientation,
    __loop,
    __collapsible,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    __itemValue,
    __itemIndex,
    __itemDisabled,
    __itemId,
    __triggerId,
    __contentId,
    ...rest
  } = props;
  const injected = readAccordionItemInjectedProps({
    __accordionId,
    __type,
    __value,
    __setValue,
    __orientation,
    __loop,
    __collapsible,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    __itemValue,
    __itemIndex,
    __itemDisabled,
    __itemId,
    __triggerId,
    __contentId,
  });
  const collection = getCompositeCollection(injected.__accordionId);
  const nav = rovingFocus({
    currentIndex: injected.__currentIndex,
    itemCount: Math.max(injected.__itemCount, 1),
    orientation: injected.__orientation,
    loop: injected.__loop,
    isDisabled: (index) => injected.__disabledIndexes.includes(index),
    onNavigate: (index) => {
      injected.__setCurrentIndex(index);
      focusSelectedCollectionItem(collection, index);
    },
  });
  const open = isDisclosureValueOpen(
    injected.__type,
    injected.__value,
    injected.__itemValue
  );
  const isDisabled = disabled || injected.__itemDisabled;
  const interactionProps = pressable({
    disabled: isDisabled,
    onPress: (event) => {
      onPress?.(event);

      if (!event.defaultPrevented) {
        injected.__setValue(
          toggleDisclosureValue(
            injected.__type,
            injected.__value,
            injected.__itemValue,
            injected.__collapsible
          )
        );
        injected.__setCurrentIndex(injected.__itemIndex);
      }
    },
    isNativeButton: !asChild,
  });
  const finalProps = mergeProps(rest, {
    ...interactionProps,
    ...nav.item(injected.__itemIndex),
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      (node: HTMLElement | null) => {
        registerCompositeNode(injected.__triggerId, collection, node, {
          index: injected.__itemIndex,
          disabled: isDisabled,
          value: injected.__itemValue,
        });
      }
    ),
    id: injected.__triggerId,
    'data-slot': 'accordion-trigger',
    'aria-controls': injected.__contentId,
    'aria-expanded': open ? 'true' : 'false',
    'data-state': open ? 'open' : 'closed',
    'data-disabled': isDisabled ? 'true' : undefined,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return (
    <button type={typeProp ?? 'button'} {...finalProps}>
      {children}
    </button>
  );
}

export function AccordionContent(
  props: AccordionContentProps
): JSX.Element | null;
export function AccordionContent(
  props: AccordionContentAsChildProps
): JSX.Element | null;
export function AccordionContent(
  props:
    | (AccordionContentProps & AccordionItemInjectedProps)
    | (AccordionContentAsChildProps & AccordionItemInjectedProps)
) {
  const {
    asChild,
    children,
    forceMount = false,
    ref,
    __accordionId,
    __type,
    __value,
    __setValue,
    __orientation,
    __loop,
    __collapsible,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    __itemValue,
    __itemIndex,
    __itemDisabled,
    __itemId,
    __triggerId,
    __contentId,
    ...rest
  } = props;
  const injected = readAccordionItemInjectedProps({
    __accordionId,
    __type,
    __value,
    __setValue,
    __orientation,
    __loop,
    __collapsible,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    __itemValue,
    __itemIndex,
    __itemDisabled,
    __itemId,
    __triggerId,
    __contentId,
  });
  const open = isDisclosureValueOpen(
    injected.__type,
    injected.__value,
    injected.__itemValue
  );
  const finalProps = mergeProps(rest, {
    ref,
    id: injected.__contentId,
    role: 'region',
    'aria-labelledby': injected.__triggerId,
    'data-slot': 'accordion-content',
    'data-state': open ? 'open' : 'closed',
  });

  return (
    <Presence present={forceMount || open}>
      {asChild ? (
        <Slot asChild {...finalProps} children={children} />
      ) : (
        <div {...finalProps}>{children}</div>
      )}
    </Presence>
  );
}
