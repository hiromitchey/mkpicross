import { loadShare } from "@/lib/shareStore";

// GET /api/shares/{id}  預かった共有コードを返す（中身はヒントと暗号化済みの絵だけ）
export async function GET(_req: Request, ctx: RouteContext<"/api/shares/[id]">) {
  const { id } = await ctx.params;
  const code = await loadShare(id);
  if (!code) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(
    { code },
    { headers: { "Cache-Control": "public, max-age=31536000, immutable", "X-Robots-Tag": "noindex" } },
  );
}
