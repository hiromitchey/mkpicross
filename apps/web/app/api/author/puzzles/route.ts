import {
  blackRatio,
  computeClues,
  decodeBits,
  estimateDifficulty,
  solve,
  type GivenCell,
} from "@picross/core";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { puzzles, puzzleVersions, users } from "@/db/schema";

interface CreateBody {
  title?: unknown;
  width?: unknown;
  height?: unknown;
  solution?: unknown; // 行優先ビット列のbase64
  givens?: unknown;
  convertParams?: unknown;
  imageKey?: unknown;
}

const isSize = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 5 && (n as number) <= 30;

// POST /api/author/puzzles  下書きとして作成（版1）。ヒントと検証結果はサーバーで計算し直す
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as CreateBody | null;
  if (!b || typeof b.title !== "string" || !b.title.trim() || b.title.length > 60) return bad("title");
  if (!isSize(b.width) || !isSize(b.height)) return bad("size");
  if (typeof b.solution !== "string") return bad("solution");
  if (typeof b.imageKey !== "string" || !/^[0-9a-f-]{36}\.webp$/.test(b.imageKey)) return bad("imageKey");

  let solution;
  try {
    solution = decodeBits(b.solution, b.width, b.height);
  } catch {
    return bad("solution");
  }
  const givens = parseGivens(b.givens, b.width, b.height);
  if (!givens) return bad("givens");

  const clues = computeClues(solution);
  const result = solve(clues, { givens, search: false });

  const [author] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  if (!author) return Response.json({ error: "admin ユーザーが未登録" }, { status: 500 });

  const id = await db.transaction(async (tx) => {
    const [p] = await tx.insert(puzzles).values({ authorId: author.id, title: b.title as string }).returning({ id: puzzles.id });
    await tx.insert(puzzleVersions).values({
      puzzleId: p.id,
      version: 1,
      width: solution.width,
      height: solution.height,
      solution: b.solution as string,
      rowClues: clues.rows,
      colClues: clues.cols,
      givenCells: givens,
      difficulty: estimateDifficulty(result, solution.width, solution.height),
      blackRatio: blackRatio(solution),
      solverResult: { status: result.status, level: result.level, probes: result.probes, lineSteps: result.lineSteps },
      convertParams: (b.convertParams ?? {}) as Record<string, unknown>,
      imageKey: b.imageKey as string,
    });
    return p.id;
  });

  return Response.json({ id, status: result.status, level: result.level, unresolved: result.unresolved });
}

function bad(field: string) {
  return Response.json({ error: `invalid ${field}` }, { status: 400 });
}

function parseGivens(v: unknown, w: number, h: number): GivenCell[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > w * h) return null;
  const out: GivenCell[] = [];
  for (const g of v) {
    const { x, y, state } = (g ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(x) || !Number.isInteger(y) || (state !== 1 && state !== 2)) return null;
    if ((x as number) < 0 || (y as number) < 0 || (x as number) >= w || (y as number) >= h) return null;
    out.push({ x: x as number, y: y as number, state });
  }
  return out;
}
