/**
 * Portal / Host primitive.
 *
 * A portal is a named render slot within the existing tree.
 * It does NOT create a second tree or touch the DOM directly.
 */

export interface Portal<T = unknown> {
  /** Mount point — rendered exactly once */
  (): unknown;

  /** Render content into the portal */
  render(props: { children?: T }): unknown;
}

export function definePortal<T = unknown>(): Portal<T> {
  // Runtime-provided slot implementation
  const slot = createPortalSlot<T>();

  function PortalHost() {
    return slot.read();
  }

  PortalHost.render = function PortalRender(props: { children?: T }) {
    slot.write(props.children);
    return null;
  };

  return PortalHost as Portal<T>;
}

/**
 * NOTE:
 * createPortalSlot is a runtime primitive.
 * It owns scheduling, consistency, and SSR behavior.
 */
declare function createPortalSlot<T>(): {
  read(): unknown;
  write(value: T | undefined): void;
};
