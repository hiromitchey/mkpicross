import { solveLine } from "./lineSolver";
import { BLACK, UNKNOWN, WHITE, type Clues, type GivenCell, type Grid } from "./types";

/**
 * unique   : 解は1つ（level 1・2 なら推測なしで解ける）
 * multiple : 別解あり
 * none     : 解なし（ヒントが矛盾）
 * unknown  : 推測が必要。分岐探索を省略、または時間切れで一意かどうか未判定
 */
export type SolveStatus = "unique" | "multiple" | "none" | "unknown";

export interface SolveResult {
  status: SolveStatus;
  // 1 = ライン解法のみ, 2 = 仮置きが必要, 3 = 推測（分岐探索）が必要
  level: 1 | 2 | 3;
  deduced: Grid; // ライン解法＋仮置きで確定した盤面（未確定 = 0）。作者画面の未確定マス強調に使う
  unresolved: number; // deduced の未確定マス数
  solutions: Grid[]; // 見つかった解（最大2個）
  lineSteps: number;
  probes: number; // 仮置きで確定したマス数
  branches: number; // 分岐探索のノード数
  timedOut: boolean;
  ms: number;
}

export interface SolveOptions {
  givens?: GivenCell[];
  search?: boolean; // level 3 のとき分岐探索で一意/別解を調べるか（既定 true）
  timeoutMs?: number; // 分岐探索の制限時間（既定 3000）
}

class Timeout extends Error {}

// ライン解法と仮置き。盤面 c を直接書き換える
export function createEngine(clues: Clues) {
  const width = clues.cols.length;
  const height = clues.rows.length;
  const rowBuf = new Uint8Array(width);
  const colBuf = new Uint8Array(height);
  const stats = { lineSteps: 0, probes: 0 };
  let deadline = Infinity;

  function propagate(c: Uint8Array, rows: Set<number>, cols: Set<number>): boolean {
    while (rows.size || cols.size) {
      if (Date.now() > deadline) throw new Timeout();
      for (const y of rows) {
        rows.delete(y);
        rowBuf.set(c.subarray(y * width, (y + 1) * width));
        stats.lineSteps++;
        const r = solveLine(rowBuf, clues.rows[y]);
        if (!r) return false;
        for (let x = 0; x < width; x++) {
          if (r[x] !== rowBuf[x]) {
            c[y * width + x] = r[x];
            cols.add(x);
          }
        }
      }
      for (const x of cols) {
        cols.delete(x);
        for (let y = 0; y < height; y++) colBuf[y] = c[y * width + x];
        stats.lineSteps++;
        const r = solveLine(colBuf, clues.cols[x]);
        if (!r) return false;
        for (let y = 0; y < height; y++) {
          if (r[y] !== colBuf[y]) {
            c[y * width + x] = r[y];
            rows.add(y);
          }
        }
      }
    }
    return true;
  }

  const range = (n: number) => new Set(Array.from({ length: n }, (_, i) => i));
  const propagateAll = (c: Uint8Array) => propagate(c, range(height), range(width));
  const set = (c: Uint8Array, i: number, v: number) => {
    c[i] = v;
    return propagate(c, new Set([Math.floor(i / width)]), new Set([i % width]));
  };

  // 仮置き: 1マスを黒（白）と仮定 → 矛盾したら逆の色で確定。変化がなくなるまで
  function probe(c: Uint8Array): boolean {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < c.length; i++) {
        if (c[i] !== UNKNOWN) continue;
        for (const v of [BLACK, WHITE]) {
          if (!set(new Uint8Array(c), i, v)) {
            stats.probes++;
            if (!set(c, i, v === BLACK ? WHITE : BLACK)) return false;
            changed = true;
            break;
          }
        }
      }
    }
    return true;
  }

  return {
    width,
    height,
    stats,
    propagateAll,
    set,
    probe,
    setDeadline: (t: number) => (deadline = t),
  };
}

export function solve(clues: Clues, opts: SolveOptions = {}): SolveResult {
  const t0 = Date.now();
  const e = createEngine(clues);
  const { width, height } = e;
  const cells = new Uint8Array(width * height);
  for (const g of opts.givens ?? []) cells[g.y * width + g.x] = g.state;

  const solutions: Grid[] = [];
  let level: 1 | 2 | 3 = 1;
  let branches = 0;
  let timedOut = false;
  const grid = (c: Uint8Array): Grid => ({ width, height, cells: new Uint8Array(c) });
  const countUnknown = (c: Uint8Array) => c.reduce((n, v) => n + (v === UNKNOWN ? 1 : 0), 0);

  const finish = (status: SolveStatus, deduced: Uint8Array): SolveResult => ({
    status,
    level,
    deduced: grid(deduced),
    unresolved: countUnknown(deduced),
    solutions,
    ...e.stats,
    branches,
    timedOut,
    ms: Date.now() - t0,
  });

  // 1. ライン解法 → 2. 仮置き（どちらも推測なし。ここで全マス確定すれば一意）
  if (!e.propagateAll(cells)) return finish("none", cells);
  if (countUnknown(cells) > 0) {
    const before = e.stats.probes;
    if (!e.probe(cells)) return finish("none", cells);
    if (e.stats.probes > before) level = 2;
  }
  if (countUnknown(cells) === 0) {
    solutions.push(grid(cells));
    return finish("unique", cells);
  }

  // 3. 推測が必要。分岐探索で一意/別解を調べる（別解の差分表示用）
  level = 3;
  if (opts.search === false) return finish("unknown", cells);

  function pickCell(c: Uint8Array): number {
    // 未確定マスが最も少ない行の、最初の未確定マス
    let bestY = -1;
    let best = Infinity;
    for (let y = 0; y < height; y++) {
      let n = 0;
      for (let x = 0; x < width; x++) if (c[y * width + x] === UNKNOWN) n++;
      if (n > 0 && n < best) {
        best = n;
        bestY = y;
      }
    }
    if (bestY < 0) return -1;
    for (let x = 0; x < width; x++) if (c[bestY * width + x] === UNKNOWN) return bestY * width + x;
    return -1;
  }

  function search(c: Uint8Array): void {
    branches++;
    const i = pickCell(c);
    if (i < 0) {
      solutions.push(grid(c));
      return;
    }
    for (const v of [BLACK, WHITE]) {
      const next = new Uint8Array(c);
      if (e.set(next, i, v)) search(next);
      if (solutions.length >= 2) return;
    }
  }

  e.setDeadline(Date.now() + (opts.timeoutMs ?? 3000));
  try {
    search(new Uint8Array(cells));
  } catch (err) {
    if (!(err instanceof Timeout)) throw err;
    timedOut = true;
  }
  if (solutions.length >= 2) return finish("multiple", cells);
  if (timedOut) return finish("unknown", cells);
  return finish(solutions.length === 1 ? "unique" : "none", cells);
}

// 公開条件: 推測なしで一意に解ける（level 3 を許すかは運用で決める）
export function isPublishable(r: SolveResult, maxLevel: 1 | 2 | 3 = 2): boolean {
  return r.status === "unique" && r.level <= maxLevel;
}

// 難易度 ★1〜5 の目安（運用しながら係数を調整）
export function estimateDifficulty(r: SolveResult, width: number, height: number): number {
  const size = Math.max(width, height);
  let stars = size <= 10 ? 1 : size <= 15 ? 2 : size <= 20 ? 3 : 4;
  if (r.level === 2) stars += r.probes > 10 ? 2 : 1;
  if (r.level === 3) stars = 5;
  return Math.min(5, Math.max(1, stars));
}
