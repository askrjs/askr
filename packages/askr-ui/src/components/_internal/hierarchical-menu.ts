import type { JSXElement } from '@askrjs/askr/foundations';
import { isJsxElement } from './jsx';

export function pathIsOpen(openPath: string[], path: string[]) {
  return path.every((value, index) => openPath[index] === value);
}

export function samePath(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => right[index] === value)
  );
}

export function collectSurfaceElements(
  children: unknown,
  predicate: (element: JSXElement) => boolean,
  shouldSkip: (element: JSXElement) => boolean
): JSXElement[] {
  const result: JSXElement[] = [];

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!isJsxElement(value)) {
      return;
    }

    if (predicate(value)) {
      result.push(value);
      return;
    }

    if (shouldSkip(value)) {
      return;
    }

    visit(value.props?.children);
  };

  visit(children);
  return result;
}

export function mapSurfaceChildren(
  children: unknown,
  mapper: (element: JSXElement) => unknown,
  shouldSkip: (element: JSXElement) => boolean
): unknown {
  if (Array.isArray(children)) {
    return children.map((child) =>
      mapSurfaceChildren(child, mapper, shouldSkip)
    );
  }

  if (!isJsxElement(children)) {
    return children;
  }

  const mapped = mapper(children);

  if (!isJsxElement(mapped) || shouldSkip(mapped)) {
    return mapped;
  }

  const currentChildren = mapped.props?.children;
  const nextChildren = mapSurfaceChildren(currentChildren, mapper, shouldSkip);

  if (nextChildren === currentChildren) {
    return mapped;
  }

  return {
    ...mapped,
    props: {
      ...mapped.props,
      children: nextChildren,
    },
  };
}
