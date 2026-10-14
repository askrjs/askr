/** Controlled selects retain exact option state during rollback and resync. */
import { readValue } from '../reactive/readable';
import { applyScalarPropValue } from './prop-values';
import type { Pass } from './pass';
import { HOST, ROOT, type HostNode, type Parent } from './tree';

/** Write props that must follow the element's children. */
function captureSelectUndo(select: HTMLSelectElement): () => void {
  const beforeValue = select.getAttribute('value');
  const beforeIndex = select.selectedIndex;
  const beforeOptions = Array.from(select.options, (option) => ({
    option,
    selected: option.selected,
    attribute: option.hasAttribute('selected'),
  }));
  return () => {
    if (beforeValue === null) select.removeAttribute('value');
    else select.setAttribute('value', beforeValue);
    for (const { option, attribute } of beforeOptions) {
      if (attribute) option.setAttribute('selected', '');
      else option.removeAttribute('selected');
    }
    if (select.multiple) {
      for (const { option, selected } of beforeOptions)
        option.selected = selected;
    } else {
      select.selectedIndex = beforeIndex;
    }
  };
}

export function recordSelectUndo(pass: Pass, node: HostNode): void {
  pass.onReversibleCommit(captureSelectUndo(node.el as HTMLSelectElement));
}

/** The select whose options include content under `parent`, if any. */
export function enclosingSelect(parent: Parent | null): HostNode | null {
  for (let p: Parent | null = parent; p; p = p.parent) {
    if (p.kind !== HOST) {
      if (p.kind === ROOT) return null;
      continue;
    }
    if (p.tag === 'select') return p;
    if (p.tag !== 'optgroup' && p.tag !== 'option') return null;
  }
  return null;
}

/**
 * Re-apply a committed select's controlled value against its current
 * options. Its options changed without the select itself being patched.
 */
export function resyncSelect(select: HostNode): void {
  if (select.dormant || !('value' in select.props)) return;
  const value = select.props.value;
  const resolved =
    typeof value === 'function' ? readValue(value as () => unknown) : value;
  const undo = captureSelectUndo(select.el as HTMLSelectElement);
  try {
    applyScalarPropValue(select.el, 'value', resolved, select.tag, undefined);
  } catch (error) {
    try {
      undo();
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Controlled select resynchronization and rollback failed'
      );
    }
    throw error;
  }
}
