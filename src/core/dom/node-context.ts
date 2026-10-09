/** Namespace and owning component lookup shared by node kinds. */
import { ComponentInstance } from '../component/instance';
import type { Owner } from '../reactive/owner';
import { HOST, ROOT, type Parent } from './tree';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Namespace for children of an element in namespace `ns` with tag `tag`. */
export function childNamespace(tag: string, ns: string | null): string | null {
  if (tag === 'svg') return SVG_NS;
  if (tag === 'math') return MATHML_NS;
  if (ns === SVG_NS && tag === 'foreignObject') return null;
  return ns;
}

export function elementNamespace(
  tag: string,
  parentNs: string | null
): string | null {
  if (tag === 'svg') return SVG_NS;
  if (tag === 'math') return MATHML_NS;
  return parentNs;
}

/** Namespace new children of `parent` are created in. */
export function namespaceAt(parent: Parent): string | null {
  for (let p: Parent | null = parent; p; p = p.parent) {
    if (p.kind === HOST) return childNamespace(p.tag, namespaceOf(p.el));
    if (p.kind === ROOT)
      return childNamespace(p.el.localName, namespaceOf(p.el));
  }
  return null;
}

export function namespaceOf(el: Element): string | null {
  const uri = el.namespaceURI;
  return uri === SVG_NS || uri === MATHML_NS ? uri : null;
}

export function nearestInstance(owner: Owner | null): ComponentInstance | null {
  for (let o = owner; o; o = o.parent) {
    if (o instanceof ComponentInstance) return o;
  }
  return null;
}
