import { BLACK, type Clue, type Clues, type Grid } from "./types";

// 1列分の黒マスの並び → ヒント
export function lineClue(line: ArrayLike<number>): Clue {
  const clue: number[] = [];
  let run = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === BLACK) run++;
    else if (run > 0) {
      clue.push(run);
      run = 0;
    }
  }
  if (run > 0) clue.push(run);
  return clue;
}

export function getRow(grid: Grid, y: number): Uint8Array {
  return grid.cells.subarray(y * grid.width, (y + 1) * grid.width);
}

export function getCol(grid: Grid, x: number): Uint8Array {
  const col = new Uint8Array(grid.height);
  for (let y = 0; y < grid.height; y++) col[y] = grid.cells[y * grid.width + x];
  return col;
}

// 解答（黒/白）→ 行・列ヒント
export function computeClues(solution: Grid): Clues {
  const rows: Clue[] = [];
  const cols: Clue[] = [];
  for (let y = 0; y < solution.height; y++) rows.push(lineClue(getRow(solution, y)));
  for (let x = 0; x < solution.width; x++) cols.push(lineClue(getCol(solution, x)));
  return { rows, cols };
}

function sameClue(a: Clue, b: Clue): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// 正解判定: 全行・全列のヒントを満たすか（作者の解答とは比較しない）
// board は黒 = 1、それ以外（白・×・未入力）= 黒でない として扱う
export function isSolved(board: Grid, clues: Clues): boolean {
  if (board.height !== clues.rows.length || board.width !== clues.cols.length) return false;
  for (let y = 0; y < board.height; y++) {
    if (!sameClue(lineClue(getRow(board, y)), clues.rows[y])) return false;
  }
  for (let x = 0; x < board.width; x++) {
    if (!sameClue(lineClue(getCol(board, x)), clues.cols[x])) return false;
  }
  return true;
}

// 行ごとの充足状況（プレイ画面のヒントのグレーアウト用）
export function satisfiedLines(board: Grid, clues: Clues): { rows: boolean[]; cols: boolean[] } {
  return {
    rows: clues.rows.map((c, y) => sameClue(lineClue(getRow(board, y)), c)),
    cols: clues.cols.map((c, x) => sameClue(lineClue(getCol(board, x)), c)),
  };
}
