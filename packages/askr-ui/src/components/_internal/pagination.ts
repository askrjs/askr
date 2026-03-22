export type PaginationModelEntry =
  | { type: 'page'; page: number }
  | { type: 'ellipsis'; key: 'start' | 'end' };

function range(start: number, end: number) {
  const values: number[] = [];

  for (let value = start; value <= end; value += 1) {
    values.push(value);
  }

  return values;
}

export function clampPage(page: number, count: number) {
  if (count <= 0) {
    return 1;
  }

  return Math.min(Math.max(page, 1), count);
}

export function buildPaginationModel(
  count: number,
  page: number,
  siblingCount: number,
  boundaryCount: number
): PaginationModelEntry[] {
  if (count <= 0) {
    return [];
  }

  const currentPage = clampPage(page, count);
  const totalNumbers = siblingCount * 2 + 3 + boundaryCount * 2;

  if (count <= totalNumbers) {
    return range(1, count).map((entry) => ({
      type: 'page' as const,
      page: entry,
    }));
  }

  const leftBoundary = range(1, boundaryCount);
  const rightBoundary = range(
    Math.max(count - boundaryCount + 1, boundaryCount + 1),
    count
  );
  const leftSiblingStart = Math.max(
    currentPage - siblingCount,
    boundaryCount + 2
  );
  const rightSiblingEnd = Math.min(
    currentPage + siblingCount,
    count - boundaryCount - 1
  );
  const showLeftEllipsis = leftSiblingStart > boundaryCount + 2;
  const showRightEllipsis = rightSiblingEnd < count - boundaryCount - 1;
  const middle = range(leftSiblingStart, rightSiblingEnd);
  const model: PaginationModelEntry[] = [];

  leftBoundary.forEach((entry) => {
    model.push({ type: 'page', page: entry });
  });

  if (showLeftEllipsis) {
    model.push({ type: 'ellipsis', key: 'start' });
  } else {
    range(boundaryCount + 1, leftSiblingStart - 1).forEach((entry) => {
      model.push({ type: 'page', page: entry });
    });
  }

  middle.forEach((entry) => {
    model.push({ type: 'page', page: entry });
  });

  if (showRightEllipsis) {
    model.push({ type: 'ellipsis', key: 'end' });
  } else {
    range(rightSiblingEnd + 1, count - boundaryCount).forEach((entry) => {
      model.push({ type: 'page', page: entry });
    });
  }

  rightBoundary.forEach((entry) => {
    model.push({ type: 'page', page: entry });
  });

  return model;
}
