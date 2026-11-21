import { decodeBits, isSolved } from "@picross/core";
import { NextResponse } from "next/server";
import { issueClearToken } from "@/lib/clearToken";
import { getVersionForVerify } from "@/lib/puzzleRepo";
import { signedImageUrl } from "@/lib/storage";

// v1: POST /api/puzzles/{id}/verify  body: { version, board }
export async function POST(req: Request, ctx: RouteContext<"/api/puzzles/[id]/verify">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { version?: unknown; board?: unknown } | null;
  if (typeof body?.board !== "string" || typeof body.version !== "number") {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const row = await getVersionForVerify(id, body.version);
  if (!row) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  if (row.current !== body.version) {
    return NextResponse.json({ ok: false, reason: "version_mismatch" }, { status: 409 });
  }

  let board;
  try {
    board = decodeBits(body.board, row.v.width, row.v.height);
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_board" }, { status: 400 });
  }
  if (!isSolved(board, { rows: row.v.rowClues, cols: row.v.colClues })) return NextResponse.json({ ok: false });

  return NextResponse.json({
    ok: true,
    imageUrl: signedImageUrl(row.v.imageKey),
    clearToken: issueClearToken(id, row.v.version),
  });
}
