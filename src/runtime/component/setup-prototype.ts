import type {
  ComponentContext,
  ComponentFunction,
} from '../../common/component';
import type { Props } from '../../common/props';
import { getCurrentComponentInstance } from './scope';
import { registerCommitRollback } from '../transactions/access';

const SETUP_COMPONENT = Symbol('askr.setup-component-prototype');

type SetupComponent = ComponentFunction & {
  [SETUP_COMPONENT]: true;
};

/** @internal Bounded proof for the component ownership decision in #575. */
export function defineSetupComponent<TProps extends Props>(
  setup: (
    props: TProps,
    context?: ComponentContext
  ) => (props: TProps) => ReturnType<ComponentFunction>
): (
  props: TProps,
  context?: ComponentContext
) => ReturnType<ComponentFunction> {
  const renderers = new WeakMap<
    object,
    (props: TProps) => ReturnType<ComponentFunction>
  >();
  const component = ((props: TProps, context?: ComponentContext) => {
    const instance = getCurrentComponentInstance();
    if (!instance) {
      throw new Error('A setup component requires a component lifetime.');
    }
    let render = renderers.get(instance);
    if (!render) {
      render = setup(props, context);
      renderers.set(instance, render);
      registerCommitRollback(() => renderers.delete(instance));
    }
    instance._setupRenderActive = true;
    try {
      return render(props);
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
