import { RenderableChild } from './core.js';
import { JSXElement } from './elements.js';
/**
 * Layout helper.
 *
 * A layout is just a normal component that wraps children.
 * Persistence and reuse are handled by the runtime via component identity.
 *
 * This helper exists purely for readability and convention.
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. Return Type is Opaque (unknown)
 *    Layout components return `unknown` to remain runtime-agnostic.
 *    The runtime owns concrete JSX element types.
 *
 * 2. Children Positioning
 *    Layout receives children as first argument (router-friendly).
 *    Props come second. This matches route layout conventions where
 *    children represent the nested route content.
 *
 * 3. Props Spreading
 *    Props are spread into the layout component. This is intentional
 *    and deterministic — no merging or composition.
 */
/** A component that receives its route children via `props.children`. */
type LayoutComponent<P = object> = (
  props: P & {
    children?: RenderableChild;
  }
) => unknown;
/**
 * Wrap a {@link LayoutComponent} so it can be invoked as `(children, props)`,
 * matching route layout conventions.
 */
declare function layout<P = object>(
  Layout: LayoutComponent<P>
): (children?: RenderableChild, props?: P) => unknown;
/** Check whether `value` is a JSX element vnode. */
declare function isElement(value: unknown): value is JSXElement;
/** Clone a JSX element, shallow-merging `props` over its existing props. */
declare function cloneElement(
  element: JSXElement,
  props: Record<string, unknown>
): JSXElement;
/** Props for {@link Slot}: `asChild` selects prop-merging vs. fragment mode. */
type SlotProps =
  | {
      asChild: true;
      children: JSXElement;
      [key: string]: unknown;
    }
  | {
      asChild?: false;
      children?: RenderableChild;
    };
/**
 * Slot
 *
 * Structural primitive for prop forwarding patterns.
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. asChild Pattern
 *    When asChild=true, merges props into the single child element.
 *    Child must be a valid JSXElement; non-element children return null.
 *    **Slot props override child props** (injection pattern).
 *
 * 2. Fallback Behavior
 *    When asChild=false, returns a Fragment (structural no-op).
 *    No DOM element is introduced.
 *
 * 3. Type Safety
 *    asChild=true requires exactly one JSXElement child (enforced by type).
 *    Runtime validates with isElement() check.
 */
declare function Slot(props: SlotProps): JSXElement | null;
/** Props for {@link Presence}. */
interface PresenceProps {
  /** Whether the children should be mounted, or a function returning it. */
  present: boolean | (() => boolean);
  children?: RenderableChild;
}
/**
 * Presence
 *
 * Structural policy primitive for conditional mount/unmount.
 * - No timers
 * - No animation coupling
 * - No DOM side-effects
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. Present as Function
 *    Accepts boolean OR function to support lazy evaluation patterns.
 *    Function is called once per render. Use boolean form for static values.
 *
 * 2. Children Type
 *    Presence forwards normal renderable child content only.
 *    Imperative DOM nodes are not part of the public contract.
 *
 * 3. Immediate Mount/Unmount
 *    No exit animations or transitions. When `present` becomes false,
 *    children are removed immediately. Animation must be layered above
 *    this primitive.
 */
declare function Presence({
  present,
  children,
}: PresenceProps): JSXElement | null;
/**
 * A named portal channel created by {@link definePortal}: call it as a
 * component to render the host, and call `.render(props)` to write content.
 */
interface Portal<T extends RenderableChild = RenderableChild> {
  (): T | JSXElement | null | undefined;
  render(props: { children?: T }): unknown;
}
/** Props for the {@link Portal} component. */
interface PortalProps {
  children?: RenderableChild;
}
/** Create a new named {@link Portal} channel with its own host and content. */
declare function definePortal<
  T extends RenderableChild = RenderableChild,
>(): Portal<T>;
/**
 * The implicit portal channel that {@link Portal} writes to and that any
 * host rendered without an explicit portal falls back to.
 */
declare const DefaultPortal: Portal<RenderableChild>;
/** Write children to the {@link DefaultPortal} host wherever it is rendered. */
declare function Portal(props: PortalProps): JSXElement | null;
/**
 * createCollection
 *
 * Ordered descendant registry for coordinating items without DOM queries.
 *
 * INVARIANTS:
 * 1. Registration order determines item order (no DOM queries)
 * 2. Stable ordering across renders (insertion order preserved)
 * 3. Each item may have metadata (type-safe, user-defined)
 * 4. No implicit global state (explicit collection instances)
 * 5. No automatic cleanup (caller controls lifecycle)
 *
 * DESIGN:
 * - Returns a registry API ({ register, items, clear })
 * - Items are stored in insertion order
 * - Registration returns an unregister function
 * - No side effects on registration (pure data structure)
 *
 * USAGE:
 *   const collection = createCollection<HTMLElement, { disabled: boolean }>();
 *   const unregister = collection.register(element, { disabled: false });
 *   const allItems = collection.items();
 *   unregister();
 */
/** A registered node paired with its metadata inside a {@link Collection}. */
type CollectionItem<TNode, TMetadata = unknown> = {
  node: TNode;
  metadata: TMetadata;
};
/** Ordered descendant registry returned by {@link createCollection}. */
interface Collection<TNode, TMetadata = unknown> {
  /**
   * Register a node with optional metadata.
   * Returns an unregister function.
   */
  register(node: TNode, metadata: TMetadata): () => void;
  /**
   * Get all registered items in insertion order.
   */
  items(): ReadonlyArray<CollectionItem<TNode, TMetadata>>;
  /**
   * Clear all registered items.
   */
  clear(): void;
  /**
   * Get the count of registered items.
   */
  size(): number;
}
/** Create an empty, insertion-ordered {@link Collection} registry. */
declare function createCollection<TNode, TMetadata = unknown>(): Collection<
  TNode,
  TMetadata
>;
/**
 * USAGE EXAMPLE:
 *
 * // Create a collection for menu items
 * const menuItems = createCollection<HTMLElement, { disabled: boolean }>();
 *
 * // Register items
 * const unregister1 = menuItems.register(element1, { disabled: false });
 * const unregister2 = menuItems.register(element2, { disabled: true });
 *
 * // Query items
 * const allItems = menuItems.items();
 * const enabledItems = allItems.filter(item => !item.metadata.disabled);
 *
 * // Cleanup
 * unregister1();
 * unregister2();
 */
/**
 * createLayer
 *
 * Manages stacking order and coordination for overlays (modals, popovers, etc).
 *
 * INVARIANTS:
 * 1. Layers are ordered by registration time (FIFO)
 * 2. Only the top layer handles Escape key
 * 3. Only the top layer handles outside pointer events
 * 4. Nested layers are supported
 * 5. Does not implement portals (orthogonal concern)
 * 6. No automatic DOM insertion (caller controls mounting)
 *
 * DESIGN:
 * - Returns a layer manager with register/unregister API
 * - Each layer has a unique ID and can query if it's the top layer
 * - Escape and outside pointer coordination via callbacks
 * - No z-index management (CSS concern)
 *
 * USAGE:
 *   const manager = createLayer();
 *
 *   const layer = manager.register({
 *     onEscape: () => { ... },
 *     onOutsidePointer: () => { ... }
 *   });
 *
 *   layer.isTop(); // true if this is the topmost layer
 *   layer.unregister();
 */
/** Options for registering a layer with {@link LayerManager.register}. */
interface LayerOptions {
  /**
   * Called when Escape is pressed and this is the top layer
   */
  onEscape?: () => void;
  /**
   * Called when pointer event occurs outside and this is the top layer
   */
  onOutsidePointer?: (e: PointerEvent) => void;
  /**
   * Optional node reference for outside pointer detection
   */
  node?: Node | null;
}
/** A registered layer entry returned by {@link LayerManager.register}. */
interface Layer {
  /**
   * Unique layer ID
   */
  id: number;
  /**
   * Check if this layer is the topmost
   */
  isTop(): boolean;
  /**
   * Remove this layer from the stack
   */
  unregister(): void;
}
/** Stacking coordinator returned by {@link createLayer}. */
interface LayerManager {
  /**
   * Register a new layer
   */
  register(options: LayerOptions): Layer;
  /**
   * Get all active layers in order
   */
  layers(): ReadonlyArray<Layer>;
  /**
   * Manually trigger escape handling on the top layer
   */
  handleEscape(): void;
  /**
   * Manually trigger outside pointer handling on the top layer
   */
  handleOutsidePointer(e: PointerEvent): void;
}
/** Create a new, empty {@link LayerManager} for coordinating overlay stacking. */
declare function createLayer(): LayerManager;
/**
 * USAGE EXAMPLE:
 *
 * const layerManager = createLayer();
 *
 * function Modal({ onClose }) {
 *   const modalRef = ref<HTMLDivElement>();
 *
 *   const layer = layerManager.register({
 *     node: modalRef.current,
 *     onEscape: onClose,
 *     onOutsidePointer: onClose,
 *   });
 *
 *   onUnmount(() => layer.unregister());
 *
 *   return (
 *     <div ref={modalRef}>
 *       <h1>Modal</h1>
 *       {layer.isTop() && <p>I am on top!</p>}
 *     </div>
 *   );
 * }
 */
export {
  isElement,
  Collection,
  DefaultPortal,
  definePortal,
  Presence,
  cloneElement,
  SlotProps,
  createLayer,
  Portal,
  Slot,
  LayerManager,
  CollectionItem,
  PresenceProps,
  LayerOptions,
  createCollection,
  Layer,
  PortalProps,
  LayoutComponent,
  layout,
};
