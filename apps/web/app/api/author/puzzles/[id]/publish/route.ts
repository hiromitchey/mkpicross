import { computeClues, decodeBits, isPublishable, solve } from "@picross/core";
import { and, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/db/client";
import { puzzles, puzzleVersions } from "@/db/schema";
import { isUuid } from "@/lib/puzzleRepo";

// POST /api/author/puzzles/{id}/publish
// ブラウザ側の検証結果は信用せず、保存済みの解答からヒントを作り直して再検証してから公開
export async function POST(_req: Request, ctx: RouteContext<"/api/author/puzzles/[id]/publish">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404 });
  const [row] = await db
    .select({ p: puzzles, v: puzzleVersions })
    .from(puzzles)
    .innerJoin(puzzleVersions, and(eq(puzzleVersions.puzzleId, puzzles.id), eq(puzzleVersions.version, puzzles.currentVersion)))
    .where(eq(puzzles.id, id))
    .limit(1);
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });

  const solution = decodeBits(row.v.solution, row.v.width, row.v.height);
  const clues = computeClues(solution);
  const sameClues = JSON.stringify(clues) === JSON.stringify({ rows: row.v.rowClues, cols: row.v.colClues });
  const result = solve(clues, { givens: row.v.givenCells, search: false });
  if (!sameClues || !isPublishable(result)) {
    return Response.json({ error: "not_publishable", status: result.status, level: result.level, unresolved: result.unresolved }, { status: 422 });
  }

  await db.update(puzzles).set({ status: "published", publishedAt: row.p.publishedAt ?? new Date() }).where(eq(puzzles.id, id));
  // 公開前の「見つからない」キャッシュが残らないよう即時破棄
  revalidateTag(`puzzle-${id}`, { expire: 0 });
  revalidateTag("puzzle-list", { expire: 0 });
  return Response.json({ ok: true });
}
