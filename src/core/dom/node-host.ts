/** Host creation and patching record their live mutations on the Pass. */
import { warnInvalidNesting } from '../../common/dev-warnings';
import type { Props } from '../../common/props';
import type { Key } from '../view/children';
import { CommitMutationError } from './pass';
import { removeUnrenderedAttributes } from './hydration';
import { isDangerousInnerHTMLPayload } from './prop-values';
import {
  applyInitialProps,
  applyTrailingProps,
  attachRef,
  patchProps,
  restoreElementChildren,
} from './props';
import {
  childContext,
  reconcileChildren,
  type RenderContext,
} from './reconcile';
import { HOST, type HostNode, type Parent } from './tree';
import {
  childNamespace,
  elementNamespace,
  namespaceOf,
  nearestInstance,
} from './node-context';
import { deferDormantHost } from './node-hydration';
import { markSelectSynced, syncEnclosingSelect } from './node-select';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

/** Tag of the nearest host element above `parent`, if any. */
function enclosingHostTag(parent: Parent): string | null {
  for (let p: Parent | null = parent; p; p = p.parent) {
    if (p.kind === HOST) return namespaceOf(p.el) === null ? p.tag : null;
  }
  return null;
}

export function createHost(
  ctx: RenderContext,
  parent: Parent,
  key: Key | undefined,
  tag: string,
  props: Props
): HostNode {
  const ns = elementNamespace(tag, ctx.ns);
  if (__ASKR_DEVELOPMENT_BUILD__ && ns === null) {
    const host = enclosingHostTag(parent);
    if (host) warnInvalidNesting(host, tag.toLowerCase(), 'client');
  }
  const hydrate = ctx.hydrate;
  const adopted = hydrate
    ? hydrate.cursor.claimElement(hydrate.container, tag, ns)
    : null;
  const el =
    adopted ??
    (ns ? document.createElementNS(ns, tag) : document.createElement(tag));
  const node: HostNode = {
    kind: HOST,
    parent,
    key,
    el,
    tag,
    props,
    children: [],
    bindings: null,
    listeners: null,
    owner: nearestInstance(ctx.owner),
  };
  if (adopted && deferDormantHost(ctx, node, ns)) return node;
  applyInitialProps(ctx.pass, node, adopted !== null);
  if (!adopted && isTextareaWithValue(el, props)) {
    // A textarea's initial value is its text content, which is what SSR
    // writes; fill it once the value is written so client and server markup
    // agree. Later updates change only the live value.
    ctx.pass.op(() => {
      const control = el as HTMLTextAreaElement;
      if (control.defaultValue !== control.value) {
        control.defaultValue = control.value;
      }
    });
  }
  if (adopted) {
    ctx.pass.op(() => {
      try {
        removeUnrenderedAttributes(
          adopted,
          props,
          hydrate!.cursor.strict,
          (attributes) => {
            ctx.pass.onReversibleCommit(() => {
              for (const attribute of attributes) {
                adopted.setAttributeNode(attribute);
              }
            });
          }
        );
      } catch (error) {
        throw new CommitMutationError(error);
      }
    });
  }
  if (
    !isDangerousInnerHTMLPayload(props.dangerouslySetInnerHTML) &&
    !(adopted && isTextareaWithValue(el, props))
  ) {
    node.children = reconcileChildren(
      childContext(
        ctx,
        childNamespace(tag, ns),
        adopted && hydrate
          ? { cursor: hydrate.cursor, container: adopted }
          : null
      ),
      node,
      props.children,
      true
    );
  }
  applyTrailingProps(ctx.pass, node, props, true, adopted !== null);
  attachRef(ctx.pass, node, undefined);
  return node;
}

/**
 * SSR writes a `textarea` value as its text content (the control's initial
 * value). Hydration keeps that server text rather than claiming children the
 * client never renders, a fresh host writes it once, and re-renders leave it
 * to the value writer.
 */
function isTextareaWithValue(el: Element, props: Props): boolean {
  if (el.localName !== 'textarea' || namespaceOf(el) !== null) return false;
  const value = props.value;
  return value !== undefined && value !== null && value !== false;
}

function ownsChildren(props: Props): boolean {
  return (
    !props.imperativeChildren &&
    !isDangerousInnerHTMLPayload(props.dangerouslySetInnerHTML)
  );
}

export function patchHost(
  ctx: RenderContext,
  node: HostNode,
  props: Props
): void {
  const previous = node.props;
  if (previous === props) return;
  if (node.dormant) {
    // Activation hydrates with the latest props.
    ctx.pass.op(() => {
      const previous = node.props;
      ctx.pass.onReversibleCommit(() => {
        node.props = previous;
      });
      node.props = props;
    });
    return;
  }
  const wasManaged = ownsChildren(previous);
  const isManaged = ownsChildren(props);
  if (wasManaged && !isManaged) {
    reconcileChildren(ctx, node, null, false);
  }
  patchProps(ctx.pass, node, previous, props);
  if (node.tag === 'option' && !Object.is(previous.value, props.value)) {
    syncEnclosingSelect(ctx.pass, node.parent);
  }
  if (!wasManaged && isManaged && node.children.length === 0) {
    ctx.pass.op(() => {
      const children = Array.from(node.el.childNodes);
      ctx.pass.onReversibleCommit(() =>
        restoreElementChildren(node.el, children)
      );
      try {
        node.el.replaceChildren();
      } catch (error) {
        throw new CommitMutationError(error);
      }
    });
  }
  if (isManaged) {
    reconcileChildren(
      childContext(
        ctx,
        childNamespace(node.tag, namespaceOf(node.el)),
        ctx.hydrate
      ),
      node,
      props.children,
      false
    );
    if (
      (props.children === undefined ||
        props.children === null ||
        props.children === false) &&
      // A textarea's text is its default value, owned by the value writer.
      !isTextareaWithValue(node.el, props)
    ) {
      ctx.pass.op(() => {
        if (!node.el.firstChild) return;
        const previous = Array.from(node.el.childNodes);
        ctx.pass.onReversibleCommit(() =>
          restoreElementChildren(node.el, previous)
        );
        try {
          node.el.replaceChildren();
        } catch (error) {
          throw new CommitMutationError(error);
        }
      });
    }
  }
  ctx.pass.op(() => {
    const previous = node.props;
    ctx.pass.onReversibleCommit(() => {
      node.props = previous;
    });
    node.props = props;
  });
  if (node.tag === 'select') {
    ctx.pass.op(() => {
      applyTrailingProps(ctx.pass, node, props);
      markSelectSynced(ctx.pass, node);
    });
  }
  if (props.ref !== previous.ref) {
    attachRef(ctx.pass, { ...node, props }, previous.ref);
  }
}
