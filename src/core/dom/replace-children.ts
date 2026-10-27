/** Spreading more nodes than this into one call can exceed an engine's argument limit. */
const MAX_ARGUMENTS = 10_000;

/**
 * `el.replaceChildren(...nodes)` that stays within the argument limit: a long
 * list is appended in chunks after the element is emptied.
 */
export function replaceChildrenOf(el: Element, nodes: readonly Node[]): void {
  if (nodes.length <= MAX_ARGUMENTS) {
    el.replaceChildren(...nodes);
    return;
  }
  el.replaceChildren();
  for (let start = 0; start < nodes.length; start += MAX_ARGUMENTS) {
    el.append(...nodes.slice(start, start + MAX_ARGUMENTS));
  }
}
