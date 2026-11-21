import { NextResponse } from "next/server";
import { verifyClearToken } from "@/lib/clearToken";
import { getVersionForVerify } from "@/lib/puzzleRepo";
import { signedImageUrl } from "@/lib/storage";

// v1: POST /api/puzzles/{id}/reveal  body: { clearToken }
// 一度クリアした人が再訪したとき、元イラストのURLを再発行する（クリアした版の画像）
export async function POST(req: Request, ctx: RouteContext<"/api/puzzles/[id]/reveal">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { clearToken?: unknown } | null;
  const t = typeof body?.clearToken === "string" ? verifyClearToken(body.clearToken, id) : null;
  if (!t) return NextResponse.json({ ok: false }, { status: 403 });
  const row = await getVersionForVerify(id, t.version);
  if (!row) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, imageUrl: signedImageUrl(row.v.imageKey) });
}
