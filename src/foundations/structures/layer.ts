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

export interface LayerOptions {
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

export interface Layer {
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

export interface LayerManager {
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

export function createLayer(): LayerManager {
  const stack: Array<{
    id: number;
    options: LayerOptions;
  }> = [];

  let nextId = 1;

  function register(options: LayerOptions): Layer {
    const id = nextId++;
    const entry = { id, options };
    stack.push(entry);

    function isTop(): boolean {
      return stack[stack.length - 1]?.id === id;
    }

    function unregister(): void {
      const index = stack.findIndex((e) => e.id === id);
      if (index !== -1) {
        stack.splice(index, 1);
      }
    }

    return {
      id,
      isTop,
      unregister,
    };
  }

  function layers(): ReadonlyArray<Layer> {
    return stack.map((entry) => ({
      id: entry.id,
      isTop: () => stack[stack.length - 1]?.id === entry.id,
      unregister: () => {
        const index = stack.findIndex((e) => e.id === entry.id);
        if (index !== -1) {
          stack.splice(index, 1);
        }
      },
    }));
  }

  function handleEscape(): void {
    const top = stack[stack.length - 1];
    if (top) {
      top.options.onEscape?.();
    }
  }

  function handleOutsidePointer(e: PointerEvent): void {
    const top = stack[stack.length - 1];
    if (!top) return;

    const node = top.options.node;
    if (node && e.target instanceof Node) {
      // Check if the event target is outside the layer node
      if (!node.contains(e.target)) {
        top.options.onOutsidePointer?.(e);
      }
    } else {
      // No node provided, always trigger
      top.options.onOutsidePointer?.(e);
    }
  }

  return {
    register,
    layers,
    handleEscape,
    handleOutsidePointer,
  };
}

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
