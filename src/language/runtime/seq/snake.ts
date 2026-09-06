export type SnakeMovement = 'snake' | 'rows' | 'columns' | 'spiral' | 'diagonal' | 'bounce' | 'random' | 'walk';

export interface SnakeDefinition {
  width: number;
  height: number;
  values: number[];
  movement: SnakeMovement;
}

export interface SnakeReaderState {
  cell: number;
  cursor: number;
  direction: number;
}

export interface SnakeStepResult {
  frequency: number;
  cell: number;
  state: SnakeReaderState;
}

function rowMajor(width: number, height: number): number[] {
  return Array.from({ length: width * height }, (_, index) => index);
}

function columnMajor(width: number, height: number): number[] {
  const result: number[] = [];
  for (let x = 0; x < width; x += 1) for (let y = 0; y < height; y += 1) result.push(y * width + x);
  return result;
}

function snakeRows(width: number, height: number): number[] {
  const result: number[] = [];
  for (let y = 0; y < height; y += 1) {
    if (y % 2 === 0) for (let x = 0; x < width; x += 1) result.push(y * width + x);
    else for (let x = width - 1; x >= 0; x -= 1) result.push(y * width + x);
  }
  return result;
}

function spiral(width: number, height: number): number[] {
  const result: number[] = [];
  let left = 0;
  let right = width - 1;
  let top = 0;
  let bottom = height - 1;
  while (left <= right && top <= bottom) {
    for (let x = left; x <= right; x += 1) result.push(top * width + x);
    top += 1;
    for (let y = top; y <= bottom; y += 1) result.push(y * width + right);
    right -= 1;
    if (top <= bottom) {
      for (let x = right; x >= left; x -= 1) result.push(bottom * width + x);
      bottom -= 1;
    }
    if (left <= right) {
      for (let y = bottom; y >= top; y -= 1) result.push(y * width + left);
      left += 1;
    }
  }
  return result;
}

function diagonal(width: number, height: number): number[] {
  const result: number[] = [];
  for (let diagonalIndex = 0; diagonalIndex <= width + height - 2; diagonalIndex += 1) {
    const cells: number[] = [];
    for (let y = 0; y < height; y += 1) {
      const x = diagonalIndex - y;
      if (x >= 0 && x < width) cells.push(y * width + x);
    }
    if (diagonalIndex % 2 === 1) cells.reverse();
    result.push(...cells);
  }
  return result;
}

export function snakePath(width: number, height: number, movement: SnakeMovement): number[] {
  if (movement === 'columns') return columnMajor(width, height);
  if (movement === 'spiral') return spiral(width, height);
  if (movement === 'diagonal') return diagonal(width, height);
  if (movement === 'rows' || movement === 'bounce') return rowMajor(width, height);
  return snakeRows(width, height);
}

function orthogonalNeighbors(cell: number, width: number, height: number): number[] {
  const x = cell % width;
  const y = Math.floor(cell / width);
  const result: number[] = [];
  if (x > 0) result.push(cell - 1);
  if (x + 1 < width) result.push(cell + 1);
  if (y > 0) result.push(cell - width);
  if (y + 1 < height) result.push(cell + width);
  return result;
}

export function snakeCellFrequency(definition: SnakeDefinition, cell: number, fallback = 440): number {
  if (definition.values.length === 0) return fallback;
  const normalized = ((cell % definition.values.length) + definition.values.length) % definition.values.length;
  return definition.values[normalized] ?? fallback;
}

export function nextSnakeStep(
  definition: SnakeDefinition,
  previous: SnakeReaderState | undefined,
  random: () => number,
): SnakeStepResult {
  const total = Math.max(1, definition.width * definition.height);
  let cell = previous?.cell ?? 0;
  let cursor = previous?.cursor ?? -1;
  let direction = previous?.direction ?? 1;

  if (definition.movement === 'random') {
    cell = Math.min(total - 1, Math.floor(random() * total));
  } else if (definition.movement === 'walk') {
    const neighbors = orthogonalNeighbors(cell, definition.width, definition.height);
    if (neighbors.length > 0) cell = neighbors[Math.min(neighbors.length - 1, Math.floor(random() * neighbors.length))];
  } else {
    const path = snakePath(definition.width, definition.height, definition.movement);
    if (path.length === 0) path.push(0);
    if (definition.movement === 'bounce') {
      if (cursor < 0) cursor = 0;
      else {
        cursor += direction;
        if (cursor >= path.length) {
          direction = -1;
          cursor = Math.max(0, path.length - 2);
        } else if (cursor < 0) {
          direction = 1;
          cursor = Math.min(path.length - 1, 1);
        }
      }
    } else {
      cursor = (cursor + 1) % path.length;
    }
    cell = path[cursor] ?? 0;
  }

  return {
    frequency: snakeCellFrequency(definition, cell),
    cell,
    state: { cell, cursor, direction },
  };
}
