export function resolveRootElement(root: Element | string): Element | null {
  if (typeof root !== 'string') return root;
  const id = root.startsWith('#') ? root.slice(1) : root;
  return document.getElementById(id);
}
