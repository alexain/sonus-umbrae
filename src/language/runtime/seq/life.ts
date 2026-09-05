export type LifeVariant = 'conway' | 'highlife' | 'seeds' | 'day-night' | 'morley';

const LIFE_RULES: Record<LifeVariant, { birth: ReadonlySet<number>; survive: ReadonlySet<number> }> = {
  conway: { birth: new Set([3]), survive: new Set([2, 3]) },
  highlife: { birth: new Set([3, 6]), survive: new Set([2, 3]) },
  seeds: { birth: new Set([2]), survive: new Set() },
  'day-night': { birth: new Set([3, 6, 7, 8]), survive: new Set([3, 4, 6, 7, 8]) },
  morley: { birth: new Set([3, 6, 8]), survive: new Set([2, 4, 5]) },
};

export function capLifeDensity(
  cells: boolean[],
  maxDensity: number | null,
  random: () => number,
): boolean[] {
  if (maxDensity === null) return cells;
  const maxAlive = Math.floor(cells.length * (maxDensity / 100));
  const live = cells.map((alive, index) => alive ? index : -1).filter((index) => index >= 0);
  if (live.length <= maxAlive) return cells;

  const next = [...cells];
  for (let i = live.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [live[i], live[j]] = [live[j], live[i]];
  }
  for (let i = maxAlive; i < live.length; i += 1) next[live[i]] = false;
  return next;
}

export function initializeLifeCells(
  size: number,
  density: number,
  maxDensity: number | null,
  random: () => number,
): boolean[] {
  const total = size * size;
  let cells = Array.from({ length: total }, () => random() < density / 100);
  cells = capLifeDensity(cells, maxDensity, random);

  if (!cells.some(Boolean) && total > 0 && density > 0 && (maxDensity === null || maxDensity > 0)) {
    cells[Math.floor(random() * total)] = true;
  }
  return cells;
}

export function evolveLife(
  cells: boolean[],
  size: number,
  variant: LifeVariant,
): boolean[] {
  const rule = LIFE_RULES[variant];
  const next = new Array<boolean>(cells.length).fill(false);
  const at = (x: number, y: number): boolean => {
    if (x < 0 || x >= size || y < 0 || y >= size) return false;
    return cells[y * size + x] ?? false;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if ((dx !== 0 || dy !== 0) && at(x + dx, y + dy)) neighbors += 1;
        }
      }
      const alive = at(x, y);
      next[y * size + x] = alive ? rule.survive.has(neighbors) : rule.birth.has(neighbors);
    }
  }

  return next;
}
