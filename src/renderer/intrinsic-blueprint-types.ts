import type { FineGrainedEffectHandle } from '../runtime';
import type { ReactiveChildDOMHost } from './reactive-children';
import type { ReactivePropCleanupEntry } from './cleanup';

export type BlueprintPropKind = 'empty' | 'event' | 'reactive' | 'ref' | 'static';

export type BlueprintPropShape = {
  kind: BlueprintPropKind;
  value?: unknown;
};

export type ReactiveSlotShape =
  | { kind: 'dynamic' }
  | { kind: 'static'; value: string };

export type BlueprintChildShape =
  | { kind: 'element'; shape: BlueprintElementShape }
  | { kind: 'text'; value: string };

export type BlueprintElementShape = {
  tagName: string;
  namespaceURI: string | null;
  propCount: number;
  props: Record<string, BlueprintPropShape>;
  children:
    | { kind: 'reactive'; slots: ReactiveSlotShape[] }
    | { kind: 'static'; slots: BlueprintChildShape[] };
};

export type IntrinsicBlueprint = {
  template: Element;
  shape: BlueprintElementShape;
};

export type BlueprintBindingGroup = {
  _coalesceForItemReads: true;
  bindings: BlueprintBinding[];
  activeCount: number;
  effect: FineGrainedEffectHandle<BlueprintBinding[]> | null;
  host: ReactiveChildDOMHost;
};

export type BlueprintOwnedEffect = FineGrainedEffectHandle<
  BlueprintBinding[]
> & {
  _owner: BlueprintBindingGroup;
};

export type BlueprintBinding = {
  active: boolean;
  group: BlueprintBindingGroup | null;
  lastClassTokens: string[] | null;
  hasValue: boolean;
  lastValue: unknown;
  nextValue: unknown;
  kind: 'prop' | 'text';
  element: Element;
  propName: string | null;
  tagName: string | null;
  textNode: Text | null;
  compute: () => unknown;
  fnRef: unknown;
  groupedScalar: boolean;
  cleanup(): void;
  updateFn(nextValue: unknown): void;
  restoreFn(nextValue: unknown): ReactivePropCleanupEntry;
};
