import { computeClues } from "./clues";
import { createEngine, solve, type SolveResult } from "./solver";
import { BLACK, UNKNOWN, WHITE, type GivenCell, type Grid } from "./types";

// 2つの盤面で黒/白が食い違うマス（別解の強調表示用）
export function diffCells(a: Grid, b: Grid): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.cells.length; i++) {
    if ((a.cells[i] === BLACK) !== (b.cells[i] === BLACK)) out.push(i);
  }
  return out;
}

// 別解のうち作者の絵と異なるもの
export function findAlternative(intended: Grid, r: SolveResult): Grid | null {
  return r.solutions.find((s) => diffCells(intended, s).length > 0) ?? null;
}

/**
 * 初期開示マスで「推測なしで解ける」状態にする。
 * ライン解法＋仮置きで残った未確定マスを1つずつ開示し、全マス確定するまで繰り返す。
 * 分岐探索を使わないので、ノイズの多い30×30でも時間内に終わる。
 * 開示マスが多い = 絵のほうを直すべきサイン（maxGivens で打ち切り）。
 */
export function suggestGivens(
  intended: Grid,
  opts: { maxGivens?: number } = {},
): { givens: GivenCell[]; solvable: boolean; result: SolveResult } {
  const clues = computeClues(intended);
  const e = createEngine(clues);
  const { width, height } = e;
  const max = opts.maxGivens ?? 20;
  const givens: GivenCell[] = [];
  const c = new Uint8Array(width * height);
  e.propagateAll(c);
  e.probe(c);

  while (c.includes(UNKNOWN) && givens.length < max) {
    const i = pickReveal(c, intended);
    const state = intended.cells[i] === BLACK ? BLACK : WHITE;
    givens.push({ x: i % width, y: Math.floor(i / width), state });
    // 作者の絵はヒントを満たすので、ここで矛盾は起きない
    e.set(c, i, state);
    e.probe(c);
  }
  const result = solve(clues, { givens, search: false });
  return { givens, solvable: result.status === "unique", result };
}

// 開示するマス: 未確定マスが最も少ない行または列の中で、作者の絵で黒のマスを優先
function pickReveal(c: Uint8Array, intended: Grid): number {
  const { width: W, height: H } = intended;
  let best: number[] = [];
  let bestCount = Infinity;
  const consider = (idx: number[]) => {
    const unknown = idx.filter((i) => c[i] === UNKNOWN);
    if (unknown.length > 0 && unknown.length < bestCount) {
      bestCount = unknown.length;
      best = unknown;
    }
  };
  for (let y = 0; y < H; y++) consider(Array.from({ length: W }, (_, x) => y * W + x));
  for (let x = 0; x < W; x++) consider(Array.from({ length: H }, (_, y) => y * W + x));
  return best.find((i) => intended.cells[i] === BLACK) ?? best[0];
}
