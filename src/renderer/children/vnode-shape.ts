import { isFragmentType } from '../../common/jsx';
import { _isDOMElement, type VNode } from '../types';

/** Pure output classification, independent of range application. */
export function isMultiNodeVNode(vnode: VNode): boolean {
  if (vnode === null || vnode === undefined || vnode === false) return true;
  return (
    Array.isArray(vnode) || (_isDOMElement(vnode) && isFragmentType(vnode.type))
  );
}
