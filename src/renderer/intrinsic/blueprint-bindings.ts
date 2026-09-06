import { logger } from '../../common/logger';
import {
  createOwnedFineGrainedEffect,
  incDevCounter,
  incrementPerfMetric,
  type FineGrainedEffectHandle,
} from '../../runtime';
import { applyScalarPropValue } from '../props/attributes';
import {
  REACTIVE_CHILDREN_KEY,
  setDirectElementReactivePropCleanup,
  setFreshElementReactivePropCleanup,
  type ReactivePropCleanupEntry,
  teardownNodeSubtree,
} from '../ownership/cleanup';
import { getRuntimeEnv } from '../env';
import {
  createReactivePropCleanupEntry,
  applyFreshElementBindings,
} from '../props/bindings';
import {
  createReactiveScalarChildCleanupEntry,
  syncReactiveScalarChild,
  type ReactiveChildDOMHost,
} from '../children/reactive-children';
import {
  normalizeOwnedReactiveTextValue,
  type ReactiveScalarChildSource,
} from '../children/reactive-child-sources';
import type { VNode } from '../types';
import type {
  BlueprintBindingGroup,
  BlueprintOwnedEffect,
} from './blueprint-types';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const DEVELOPMENT_BUILD_ENABLED = __ASKR_DEVELOPMENT_BUILD__;
const EMPTY_CLASS_TOKENS: string[] = [];

export class BlueprintBinding implements ReactivePropCleanupEntry {
  active = true;
  group: BlueprintBindingGroup | null = null;
  lastClassTokens: string[] | null = null;
  hasValue = false;
  lastValue: unknown = undefined;
  nextValue: unknown = undefined;

  constructor(
    readonly kind: 'prop' | 'text',
    readonly element: Element,
    compute: () => unknown,
    readonly propName: string | null,
    readonly tagName: string | null,
    public textNode: Text | null
  ) {
    this.compute = compute;
  }

  compute: () => unknown;

  get fnRef(): unknown {
    return this.compute;
  }

  set fnRef(nextValue: unknown) {
    this.compute = nextValue as () => unknown;
  }

  get groupedScalar(): boolean {
    return this.kind === 'text';
  }

  cleanup(): void {
    if (this.group) cleanupGroupedBinding(this.group, this);
  }

  updateFn(nextValue: unknown): void {
    if (this.group) updateGroupedBinding(this.group, this, nextValue);
  }

  restoreFn(nextValue: unknown): ReactivePropCleanupEntry {
    const group = this.group;
    if (this.kind === 'text') {
      return createReactiveScalarChildCleanupEntry(
        this.element,
        [{ kind: 'dynamic', compute: nextValue as () => unknown }],
        group!.host
      );
    }
    return createReactivePropCleanupEntry(
      this.element,
      this.propName!,
      nextValue as () => unknown,
      this.tagName!
    );
  }
}

function commitBlueprintBinding(
  binding: BlueprintBinding,
  value: unknown,
  host: ReactiveChildDOMHost
): void {
  const previousValue = binding.lastValue;
  if (binding.hasValue && Object.is(previousValue, value)) return;

  if (!binding.hasValue && binding.kind === 'text' && binding.textNode) {
    const normalized = normalizeOwnedReactiveTextValue(value);
    if (normalized !== null) {
      if (binding.textNode.data !== normalized) {
        binding.textNode.data = normalized;
        if (DEVELOPMENT_BUILD_ENABLED) incDevCounter('textNodeWrites');
      }
      binding.lastValue = value;
      binding.hasValue = true;
      return;
    }
  }

  if (binding.kind === 'prop') {
    incrementPerfMetric('reactivePropReevaluations');
    if (
      !binding.hasValue &&
      (binding.propName === 'class' || binding.propName === 'className') &&
      (value === '' || value === undefined || value === null || value === false)
    ) {
      binding.lastClassTokens = EMPTY_CLASS_TOKENS;
    } else {
      applyScalarPropValue(
        binding.element,
        binding.propName!,
        value,
        binding.tagName!,
        binding.hasValue ? previousValue : undefined,
        binding
      );
    }
  } else {
    const normalized = normalizeOwnedReactiveTextValue(value);
    if (normalized === null) {
      binding.textNode = null;
      host.updateElementChildren(
        binding.element,
        value as VNode | VNode[] | undefined
      );
    } else {
      let textNode = binding.textNode;
      if (
        !textNode ||
        binding.element.firstChild !== textNode ||
        binding.element.lastChild !== textNode
      ) {
        host.updateElementChildren(binding.element, normalized);
        textNode =
          binding.element.childNodes.length === 1 &&
          binding.element.firstChild?.nodeType === Node.TEXT_NODE
            ? (binding.element.firstChild as Text)
            : null;
        binding.textNode = textNode;
      }
      if (textNode && textNode.data !== normalized) {
        textNode.data = normalized;
        if (DEVELOPMENT_BUILD_ENABLED) incDevCounter('textNodeWrites');
      }
    }
  }

  binding.lastValue = value;
  binding.hasValue = true;
}

function updateGroupedBinding(
  group: BlueprintBindingGroup,
  binding: BlueprintBinding,
  nextValue: unknown
): void {
  if (!binding.active || !group.effect) return;

  if (binding.kind === 'text') {
    const nextSource = nextValue as ReactiveScalarChildSource;
    const nextSlot = nextSource[0];
    const nextCompute =
      typeof nextValue === 'function'
        ? (nextValue as () => unknown)
        : nextSlot?.kind === 'dynamic'
          ? nextSlot.compute
          : null;
    if (!nextCompute) return;
    binding.compute = nextCompute;
  } else {
    binding.compute = nextValue as () => unknown;
  }
  group.effect.flush();
}

function cleanupGroupedBinding(
  group: BlueprintBindingGroup,
  binding: BlueprintBinding
): void {
  if (!binding.active) return;
  binding.active = false;
  group.activeCount -= 1;
  if (group.activeCount === 0) {
    group.effect?.cleanup();
    group.effect = null;
  }
}

function computeBlueprintBindings(
  this: BlueprintOwnedEffect
): BlueprintBinding[] {
  const group = this._owner;
  for (const binding of group.bindings) {
    if (binding.active) binding.nextValue = binding.compute();
  }
  return group.bindings;
}

function commitBlueprintBindings(
  this: BlueprintOwnedEffect,
  _bindings: BlueprintBinding[],
  _previousBindings: BlueprintBinding[] | undefined
): void {
  const group = this._owner;
  for (const binding of group.bindings) {
    if (binding.active) {
      commitBlueprintBinding(binding, binding.nextValue, group.host);
    }
  }
}

function blueprintBindingsChanged(
  this: BlueprintOwnedEffect,
  _previousBindings: BlueprintBinding[],
  _nextBindings: BlueprintBinding[]
): boolean {
  return false;
}

function reportBlueprintBindingError(
  this: BlueprintOwnedEffect,
  error: unknown
): void {
  if (getRuntimeEnv().NODE_ENV !== 'production') {
    logger.warn('[Askr] Blueprint reactive update failed:', error);
  }
}

export function mountBlueprintBindingGroup(
  bindings: BlueprintBinding[],
  host: ReactiveChildDOMHost
): void {
  if (bindings.length === 0) return;

  const group: BlueprintBindingGroup = {
    _coalesceForItemReads: true,
    bindings,
    activeCount: bindings.length,
    effect: null,
    host,
  };
  const effect = createOwnedFineGrainedEffect(
    'reactive',
    computeBlueprintBindings,
    commitBlueprintBindings,
    blueprintBindingsChanged,
    reportBlueprintBindingError,
    group
  ) as BlueprintOwnedEffect;
  group.effect = effect as FineGrainedEffectHandle<BlueprintBinding[]>;

  let previousElement: Element | null = null;
  for (const binding of bindings) {
    binding.group = group;
    const bindingKey =
      binding.kind === 'text' ? REACTIVE_CHILDREN_KEY : binding.propName!;
    if (binding.element === previousElement) {
      setDirectElementReactivePropCleanup(binding.element, bindingKey, binding);
    } else {
      setFreshElementReactivePropCleanup(binding.element, bindingKey, binding);
      previousElement = binding.element;
    }
  }
}

export function publishPreparedBlueprintBindings(
  element: Element,
  props: Record<string, unknown>
): void {
  applyFreshElementBindings(element, props);
}

export function cleanupBlueprintElement(element: Element): void {
  teardownNodeSubtree(element);
}

export function syncPreparedBlueprintChild(
  element: Element,
  value: unknown,
  host: ReactiveChildDOMHost
): boolean {
  return syncReactiveScalarChild(element, value, host);
}
