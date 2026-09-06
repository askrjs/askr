import type { ComponentInstance } from '../../runtime';

const MAX_COMPONENT_CHAIN_DEPTH = 100_000;
const COMPONENT_CHAIN_ERROR_CONTEXT = 8;

export function assertComponentChainDepth(
  depth: number,
  instance: ComponentInstance | null
): void {
  if (depth < MAX_COMPONENT_CHAIN_DEPTH) return;

  const names: string[] = [];
  let current = instance;
  while (current && names.length < COMPONENT_CHAIN_ERROR_CONTEXT) {
    names.push(current.fn.name || '<anonymous>');
    current = current.parentInstance;
  }

  throw new Error(
    `[Askr] Component chain exceeded ${MAX_COMPONENT_CHAIN_DEPTH.toLocaleString('en-US')} wrappers. ` +
      `This usually means component output recurses without terminating. ` +
      `Recent chain: ${names.reverse().join(' -> ')}`
  );
}
