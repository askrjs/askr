/** Text adoption and patching use reversible Pass operations. */
import { TEXT } from '../view/children';
import { CommitMutationError } from './pass';
import type { RenderContext } from './reconcile';
import type { Parent, TextNode } from './tree';
import { syncEnclosingSelect } from './node-select';

export function createText(
  ctx: RenderContext,
  parent: Parent,
  text: string
): TextNode {
  const hydrate = ctx.hydrate;
  const claimed = hydrate?.cursor.claimText(hydrate.container, text);
  if (claimed && claimed.data !== text) {
    ctx.pass.op(() => {
      const previous = claimed.data;
      ctx.pass.onReversibleCommit(() => {
        claimed.data = previous;
      });
      try {
        claimed.data = text;
      } catch (error) {
        throw new CommitMutationError(error);
      }
    });
  }
  return {
    kind: TEXT,
    parent,
    key: undefined,
    node: claimed ?? document.createTextNode(text),
    text: text,
  };
}

export function patchText(
  ctx: RenderContext,
  node: TextNode,
  text: string
): void {
  if (node.text !== text) {
    ctx.pass.op(() => {
      const previous = node.text;
      const previousData = node.node.data;
      ctx.pass.onReversibleCommit(() => {
        try {
          node.node.data = previousData;
        } finally {
          node.text = previous;
        }
      });
      try {
        node.node.data = text;
        node.text = text;
      } catch (error) {
        throw new CommitMutationError(error);
      }
    });
    // A value-less option's value is its text.
    syncEnclosingSelect(ctx.pass, node.parent);
  }
}
