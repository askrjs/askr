import type { ComponentInstance } from '../component/instance';
import {
  markReactivePropsDirtySource,
  markReadableDerivedSubscribersDirty,
  notifyReadableReaders,
  type ReadableSource,
} from './readable';

/** How a notification should treat subscribers that are already up to date. */
export interface NotifyReadableSourceOptions {
  /**
   * Skip the derived subscriber currently computing. A parent derived value
   * that synchronously pulls a dirty child is already incorporating the new
   * value, so re-marking it would schedule a redundant second pass.
   */
  skipCurrentDerivedSubscriber?: boolean;
  /** A component instance that is already handling this change. */
  skipInstance?: ComponentInstance | null;
  /** Skip readers owned by this instance. */
  skipOwnedBy?: ComponentInstance | null;
}

/**
 * Publish a change to everything subscribed to `source`.
 *
 * A readable source has four kinds of subscriber — derived values, reactive
 * props (and, through them, fine-grained effects), and component readers — and
 * every one of them has to be told, in this order. That sequence was written
 * out by hand at nine call sites across the reactivity core, portals, control
 * flow, the router and the data layer, and had already drifted into four
 * variants; the only named copy lived in `data/`, which the runtime cannot
 * import. It belongs here, beside the three primitives it drives.
 */
export function notifyReadableSource(
  source: ReadableSource<unknown>,
  options?: NotifyReadableSourceOptions
): void {
  markReadableDerivedSubscribersDirty(
    source,
    options?.skipCurrentDerivedSubscriber
  );
  markReactivePropsDirtySource(source);
  notifyReadableReaders(source, options?.skipInstance, options?.skipOwnedBy);
}
