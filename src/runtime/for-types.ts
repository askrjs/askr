import type { VNode } from '../common/vnode';

export type ForEachSource<T> = readonly T[] | (() => readonly T[]);
export type ForKeySelector<T> = (item: T, index: number) => string | number;
export type ForRenderItem<T> = (item: T, index: () => number) => VNode;
