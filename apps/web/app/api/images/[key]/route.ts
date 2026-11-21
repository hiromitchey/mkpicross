import { checkImageSig, readImage } from "@/lib/storage";

// GET /api/images/{key}?exp=...&sig=...  期限内・署名一致のときだけ画像を返す
export async function GET(req: Request, ctx: RouteContext<"/api/images/[key]">) {
  const { key } = await ctx.params;
  const url = new URL(req.url);
  if (!checkImageSig(key, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return new Response("Forbidden", { status: 403 });
  }
  const buf = await readImage(key);
  if (!buf) return new Response("Not Found", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
