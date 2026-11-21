import { blackRatio, computeClues, estimateDifficulty, solve, suggestGivens, type Grid } from "@picross/core";

// ソルバーはメインスレッドを止めないよう Web Worker で動かす
export type SolveRequest = { id: number; mode: "check" | "givens"; grid: Grid };

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<SolveRequest>) => {
  const { id, mode, grid } = e.data;
  const clues = computeClues(grid);
  if (mode === "givens") {
    const { givens, solvable, result } = suggestGivens(grid);
    ctx.postMessage({ id, clues, givens, solvable, result, difficulty: estimateDifficulty(result, grid.width, grid.height) });
    return;
  }
  const result = solve(clues, { search: true, timeoutMs: 3000 });
  ctx.postMessage({
    id,
    clues,
    result,
    blackRatio: blackRatio(grid),
    difficulty: estimateDifficulty(result, grid.width, grid.height),
  });
};
