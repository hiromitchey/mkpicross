import { decodeBits, isSolved } from "@picross/core";
import { NextResponse } from "next/server";
import { issueClearToken } from "@/lib/clearToken";
import { loadPuzzle } from "@/lib/puzzleStore";

// POST /api/puzzles/{id}/verify  body: { version, board }
export async function POST(req: Request, ctx: RouteContext<"/api/puzzles/[id]/verify">) {
  const { id } = await ctx.params;
  const p = await loadPuzzle(id);
  if (!p) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { version?: unknown; board?: unknown } | null;
  if (typeof body?.board !== "string") {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  if (body.version !== p.version) {
    return NextResponse.json({ ok: false, reason: "version_mismatch" }, { status: 409 });
  }

  let board;
  try {
    board = decodeBits(body.board, p.width, p.height);
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_board" }, { status: 400 });
  }

  // 作者の解答とは比較せず、ヒントを満たすかで判定
  if (!isSolved(board, p.clues)) return NextResponse.json({ ok: false });

  return NextResponse.json({
    ok: true,
    imageUrl: `/mvp-images/${p.image}`, // v1: signedImageUrl()（10分有効）に置き換え（v1-swap/ 参照）
    clearToken: issueClearToken(p.id, p.version),
  });
}
