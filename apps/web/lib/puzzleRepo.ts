import { and, desc, eq } from "drizzle-orm";
import { cacheTag, revalidateTag } from "next/cache";
import { db } from "@/db/client";
import { puzzles, puzzleVersions } from "@/db/schema";
import type { PublicPuzzle } from "./puzzleStore";

// v1: DB 版の問題ストア。MVP の puzzleStore.ts（JSONファイル）と同じ役割
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// URL から来た id は DB に渡す前に形式を確認（UUID でない値は PostgreSQL がエラーにする）
export const isUuid = (id: string) => UUID_RE.test(id);

const currentVersion = and(eq(puzzleVersions.puzzleId, puzzles.id), eq(puzzleVersions.version, puzzles.currentVersion));

// プレイ画面用（解答・画像キーは返さない）。公開・非公開化のたびに revalidateTag で破棄
export async function getPublicPuzzleDb(id: string): Promise<PublicPuzzle | null> {
  "use cache";
  cacheTag(`puzzle-${id}`);
  if (!UUID_RE.test(id)) return null;
  const [row] = await db
    .select({
      id: puzzles.id,
      title: puzzles.title,
      version: puzzleVersions.version,
      width: puzzleVersions.width,
      height: puzzleVersions.height,
      rows: puzzleVersions.rowClues,
      cols: puzzleVersions.colClues,
      givens: puzzleVersions.givenCells,
      difficulty: puzzleVersions.difficulty,
    })
    .from(puzzles)
    .innerJoin(puzzleVersions, currentVersion)
    .where(and(eq(puzzles.id, id), eq(puzzles.status, "published")))
    .limit(1);
  if (!row) return null;
  const { rows, cols, ...rest } = row;
  return { ...rest, clues: { rows, cols } };
}

// 問題一覧（公開中のみ・新しい順）
export async function listPublishedDb() {
  "use cache";
  cacheTag("puzzle-list");
  return db
    .select({
      id: puzzles.id,
      title: puzzles.title,
      width: puzzleVersions.width,
      height: puzzleVersions.height,
      difficulty: puzzleVersions.difficulty,
    })
    .from(puzzles)
    .innerJoin(puzzleVersions, currentVersion)
    .where(eq(puzzles.status, "published"))
    .orderBy(desc(puzzles.publishedAt));
}

// 判定API用（キャッシュしない）。版を指定して取得
export async function getVersionForVerify(id: string, version: number) {
  if (!UUID_RE.test(id) || !Number.isInteger(version)) return null;
  const [row] = await db
    .select({ v: puzzleVersions, status: puzzles.status, current: puzzles.currentVersion })
    .from(puzzleVersions)
    .innerJoin(puzzles, eq(puzzles.id, puzzleVersions.puzzleId))
    .where(and(eq(puzzleVersions.puzzleId, id), eq(puzzleVersions.version, version)))
    .limit(1);
  if (!row || row.status !== "published") return null;
  return row;
}

// 通報対応などで即非公開化（キャッシュも即破棄）
export async function hidePuzzle(id: string) {
  if (!isUuid(id)) return;
  await db.update(puzzles).set({ status: "hidden" }).where(eq(puzzles.id, id));
  revalidateTag(`puzzle-${id}`, { expire: 0 });
  revalidateTag("puzzle-list", { expire: 0 });
}
