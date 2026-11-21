import { cacheTag } from "next/cache";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Clues, GivenCell } from "@picross/core";

// MVP用: data/puzzles/<id>.json から読む。v1 で DB（puzzle_versions）に差し替える
export interface PuzzleRecord {
  id: string;
  title: string;
  version: number;
  width: number;
  height: number;
  clues: Clues;
  givens: GivenCell[];
  difficulty: number;
  solution: string; // 行優先ビット列のbase64（ブラウザには送らない）
  image: string; // 表示用イラスト（MVPは public/mvp-images 配下のファイル名）
}

// プレイヤーに送ってよい項目だけ
export type PublicPuzzle = Omit<PuzzleRecord, "solution" | "image">;

const DIR = path.join(process.cwd(), "data", "puzzles");
const ID_RE = /^[a-z0-9-]{1,64}$/; // パス操作対策

export async function listPuzzleIds(): Promise<string[]> {
  const files = await readdir(DIR);
  return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
}

export async function loadPuzzle(id: string): Promise<PuzzleRecord | null> {
  if (!ID_RE.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(DIR, `${id}.json`), "utf8")) as PuzzleRecord;
  } catch {
    return null;
  }
}

// 送ってよい項目を列挙（除外方式だと、項目を足したときに解答などが漏れる）
export function toPublic(p: PuzzleRecord): PublicPuzzle {
  const { id, title, version, width, height, clues, givens, difficulty } = p;
  return { id, title, version, width, height, clues, givens, difficulty };
}

// ページ表示用（キャッシュ付き）。公開・更新時に revalidateTag(`puzzle-${id}`) で破棄
export async function getPublicPuzzle(id: string): Promise<PublicPuzzle | null> {
  "use cache";
  cacheTag(`puzzle-${id}`);
  const p = await loadPuzzle(id);
  return p ? toPublic(p) : null;
}
