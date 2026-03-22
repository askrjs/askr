import type { JSXElement } from '@askrjs/askr/foundations';

export function isJsxElement(value: unknown): value is JSXElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$$typeof' in value &&
    'props' in value
  );
}

export function toChildArray(children: unknown): unknown[] {
  if (Array.isArray(children)) {
    return children;
  }

  return children === undefined || children === null ? [] : [children];
}

export function mapJsxTree(
  children: unknown,
  mapper: (element: JSXElement) => unknown
): unknown {
  if (Array.isArray(children)) {
    return children.map((child) => mapJsxTree(child, mapper));
  }

  if (!isJsxElement(children)) {
    return children;
  }

  const mapped = mapper(children);

  if (!isJsxElement(mapped)) {
    return mapped;
  }

  const currentChildren = mapped.props?.children;
  const nextChildren = mapJsxTree(currentChildren, mapper);

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

export function collectJsxElements(
  children: unknown,
  predicate?: (element: JSXElement) => boolean
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

    if (!predicate || predicate(value)) {
      result.push(value);
    }

    visit(value.props?.children);
  };

  visit(children);

  return result;
}

export function extractTextContent(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => extractTextContent(entry)).join('');
  }

  if (
    value === undefined ||
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'function'
  ) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (isJsxElement(value)) {
    return extractTextContent(value.props?.children);
  }

  return '';
}

export function serializeForId(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => serializeForId(item)).join('|');
  }

  if (value === undefined || value === null || typeof value === 'boolean') {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (isJsxElement(value)) {
    const typeName =
      typeof value.type === 'string'
        ? value.type
        : typeof value.type === 'function'
          ? value.type.name || 'component'
          : 'component';
    const propEntries = Object.entries(value.props ?? {})
      .filter(
        ([key, entryValue]) =>
          key !== 'children' &&
          key !== 'ref' &&
          !key.startsWith('on') &&
          (typeof entryValue === 'string' ||
            typeof entryValue === 'number' ||
            typeof entryValue === 'boolean')
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${key}:${String(entryValue)}`)
      .join(',');

    return `${typeName}[${propEntries}](${serializeForId(value.props?.children)})`;
  }

  return typeof value;
}
