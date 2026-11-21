// マスの状態: 0 = 未確定, 1 = 黒, 2 = 白
export const UNKNOWN = 0;
export const BLACK = 1;
export const WHITE = 2;
export type Cell = 0 | 1 | 2;

// 盤面: 行優先の1次元配列（index = y * width + x）
export interface Grid {
  width: number;
  height: number;
  cells: Uint8Array;
}

export type Clue = number[]; // 例: [3, 1]。空配列 = 0
export interface Clues {
  rows: Clue[];
  cols: Clue[];
}

export interface GivenCell {
  x: number;
  y: number;
  state: typeof BLACK | typeof WHITE;
}

export function createGrid(width: number, height: number, fill: Cell = UNKNOWN): Grid {
  return { width, height, cells: new Uint8Array(width * height).fill(fill) };
}
