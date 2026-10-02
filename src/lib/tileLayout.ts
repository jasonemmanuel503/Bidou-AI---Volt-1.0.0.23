export type Ratio = '9:16' | '1:1' | '16:9';
export const REFERENCE_TILE_HEIGHT = 306; // = current music tile height
const RATIO: Record<Ratio, number> = { '9:16': 9 / 16, '1:1': 1, '16:9': 16 / 9 };
const MAX_COLS: Record<Ratio, number> = { '9:16': 4, '1:1': 4, '16:9': 2 };
const MIN_TILE_W: Record<Ratio, number> = { '9:16': 120, '1:1': 140, '16:9': 200 };

export function computeTileSize(o: {
  ratio: Ratio;
  count: number;
  containerWidth: number;
  gap?: number;
  totalTilesInCanvas?: number;
}) {
  const gap = o.gap ?? 16;
  const usable = Math.max(0, Math.floor(o.containerWidth) - 1); // sub-pixel safety
  const r = RATIO[o.ratio];
  const total = o.totalTilesInCanvas ?? o.count;
  const density = o.ratio === '9:16' ? 1 : total > 8 ? 0.8 : total > 4 ? 0.9 : 1;
  const refW = REFERENCE_TILE_HEIGHT * density * r; // unchanged: keeps 9:16 exactly as today
  const colW = (c: number) => Math.floor((usable - (c - 1) * gap) / c);
  let maxCols = MAX_COLS[o.ratio];
  if (o.ratio === '1:1' && usable < 640) maxCols = Math.min(maxCols, 2); // phones/tablets: 2 per row
  let cols = Math.max(1, Math.min(o.count, maxCols));
  while (cols > 1 && colW(cols) < MIN_TILE_W[o.ratio]) cols--;
  if (o.count === 4 && cols === 3) cols = 2; // never 3+1: 4 items are 4, 2x2 or 1 column
  const width = Math.max(1, Math.floor(Math.min(refW, colW(cols))));
  return { width, height: Math.round(width / r), cols };
}
