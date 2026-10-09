import { comparePortalWriterOrder } from '../common/portal';
import type {
  SSRPortalWrite,
  SSRPortalHostRegistration,
} from '../common/render-context';
import type { Owner } from '../core/reactive/owner';
import type { RenderContext } from './context';

export function capturePortalWrites(ctx: RenderContext): () => void {
  const saved = new Map<object, Map<unknown, SSRPortalWrite>>();
  for (const [key, slot] of ctx.ssrPortals.slots) {
    saved.set(key, new Map(slot.writers));
  }
  return () => {
    for (const [key, slot] of ctx.ssrPortals.slots) {
      slot.writers = new Map(saved.get(key) ?? []);
      const ordered = [...slot.writers.values()].sort((left, right) =>
        comparePortalWriterOrder(
          left.owner as Owner | null,
          right.owner as Owner | null,
          left.order,
          right.order
        )
      );
      const latest = ordered[ordered.length - 1];
      slot.hasValue = latest !== undefined;
      slot.value = latest?.value;
      slot.owner = latest?.owner;
    }
  };
}

/** Replace portal host tokens with their portal's final content. */
export function resolvePortals(
  html: string,
  ctx: RenderContext,
  renderWrite: (
    write: SSRPortalWrite,
    host: SSRPortalHostRegistration
  ) => string
): string {
  let resolved = html;
  const rendered = new Set<string>();
  for (;;) {
    let found = false;
    for (const slot of ctx.ssrPortals.slots.values()) {
      const explicit = slot.hosts.filter((host) => !host.automatic);
      for (const host of slot.hosts) {
        if (rendered.has(host.token)) continue;
        found = true;
        rendered.add(host.token);
        const active = host.automatic ? explicit.length === 0 : true;
        const content = active
          ? [...slot.writers.values()]
              .sort((left, right) =>
                comparePortalWriterOrder(
                  left.owner as Owner | null,
                  right.owner as Owner | null,
                  left.order,
                  right.order
                )
              )
              .map((write) => renderWrite(write, host))
              .join('')
          : '';
        // An unused automatic host renders nothing; a used one whose content
        // is empty keeps its token as the hydration anchor.
        const hostContent =
          host.automatic && (!active || !slot.hasValue)
            ? ''
            : host.automatic && content === ''
              ? host.token
              : host.defaultPortal && active && slot.hasValue
                ? `<!--askr-range-start-->${content}<!--askr-range-end-->`
                : content;
        resolved = resolved.replace(host.token, () => hostContent);
      }
    }
    if (!found) return resolved;
  }
}
