import { isValidCode, MAX_CODE, saveShare } from "@/lib/shareStore";

// POST /api/shares  body: { code }  共有コードを預かって短い ID を返す
export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_CODE + 1024) return Response.json({ error: "too_large" }, { status: 413 });
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  if (!isValidCode(body?.code)) return Response.json({ error: "invalid" }, { status: 400 });
  const id = await saveShare(body.code);
  return Response.json({ id });
}
