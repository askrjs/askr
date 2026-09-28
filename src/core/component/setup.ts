/**
 * Internal setup-once component prototype used to evaluate lifetime-owned
 * lifecycle declarations without changing the public component contract.
 */

import type {
  ComponentContext,
  ComponentFunction,
} from '../../common/component';
import type { Props } from '../../common/props';
import type { JSXElement } from '../../common/jsx';
import type { VNode } from '../../common/vnode';

export type SetupRender = (
  props: Props,
  context: ComponentContext
) => JSXElement | VNode;

export type SetupDefinition = (
  initialProps: Props,
  context: ComponentContext,
  currentProps: () => Props
) => SetupRender;

const definitions = new WeakMap<ComponentFunction, SetupDefinition>();

/** Create an internal-only setup component for runtime characterization. */
export function defineSetupComponent<P extends Props>(
  setup: (
    initialProps: P,
    context: ComponentContext,
    currentProps: () => P
  ) => (props: P, context: ComponentContext) => JSXElement | VNode
): ComponentFunction {
  const component: ComponentFunction = () => null;
  definitions.set(component, setup as SetupDefinition);
  return component;
}

export function setupDefinitionFor(
  component: ComponentFunction
): SetupDefinition | undefined {
  return definitions.get(component);
}
