import type {
  ComponentContext,
  ComponentFunction,
} from '../../common/component';
import type { Props } from '../../common/props';
import { getCurrentComponentInstance } from './scope';
import { registerCommitRollback } from '../transactions/access';
import {
  recordReadableRead,
  type ReadableSource,
} from '../reactivity/readable';
import { notifyReadableSource } from '../reactivity/notify';

const SETUP_COMPONENT = Symbol('askr.setup-component-prototype');

type SetupComponent = ComponentFunction & {
  [SETUP_COMPONENT]: true;
};

/** @internal Bounded proof for the component ownership decision in #575. */
export function defineSetupComponent<TProps extends Props>(
  setup: (
    props: TProps,
    context: ComponentContext | undefined,
    currentProps: () => TProps
  ) => (props: TProps) => ReturnType<ComponentFunction>
): (
  props: TProps,
  context?: ComponentContext
) => ReturnType<ComponentFunction> {
  const renderers = new WeakMap<
    object,
    {
      render: (props: TProps) => ReturnType<ComponentFunction>;
      currentProps: TProps;
      readProps: ReadableSource<TProps>;
    }
  >();
  const component = ((props: TProps, context?: ComponentContext) => {
    const instance = getCurrentComponentInstance();
    if (!instance) {
      throw new Error('A setup component requires a component lifetime.');
    }
    let slot = renderers.get(instance);
    if (!slot) {
      const created = {
        render: null as unknown as (
          props: TProps
        ) => ReturnType<ComponentFunction>,
        currentProps: props,
        readProps: null as unknown as ReadableSource<TProps>,
      };
      const readProps = (() => {
        recordReadableRead(readProps);
        return created.currentProps;
      }) as ReadableSource<TProps>;
      created.readProps = readProps;
      created.render = setup(props, context, readProps);
      slot = created;
      renderers.set(instance, slot);
      registerCommitRollback(() => renderers.delete(instance));
    } else if (!Object.is(slot.currentProps, props)) {
      const previousProps = slot.currentProps;
      const currentSlot = slot;
      slot.currentProps = props;
      registerCommitRollback(() => {
        currentSlot.currentProps = previousProps;
        notifyReadableSource(currentSlot.readProps);
      });
      notifyReadableSource(slot.readProps);
    }
    instance._setupRenderActive = true;
    try {
      return slot.render(props);
    } finally {
      instance._setupRenderActive = false;
    }
  }) as SetupComponent;
  component[SETUP_COMPONENT] = true;
  return component;
}

export function isSetupComponent(component: ComponentFunction): boolean {
  return (component as SetupComponent)[SETUP_COMPONENT] === true;
}
