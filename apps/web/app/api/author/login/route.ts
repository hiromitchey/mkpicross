import { NextResponse } from "next/server";
import { checkPassword, issueSession, SESSION_COOKIE } from "@/lib/authorSession";

// リダイレクト先は SITE_URL 基準で組み立てる。
// req.url から組み立てると、standalone 実行時は内部の localhost:ポート になり、Traefik 配下で壊れる
const seeOther = (path: string, req: Request) => NextResponse.redirect(new URL(path, process.env.SITE_URL ?? req.url), 303);

// POST /api/author/login  (form: password)
// 試行回数制限は Traefik の RateLimit ミドルウェアでこのパスに掛ける
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const password = String(form?.get("password") ?? "");
  if (!checkPassword(password)) return seeOther("/author/login?error=1", req);

  const s = issueSession();
  const res = seeOther("/author", req);
  res.cookies.set(SESSION_COOKIE, s.value, {
    httpOnly: true,
    // https で公開しているときだけ Secure（http://localhost での動作確認でも Cookie が届くように）
    secure: (process.env.SITE_URL ?? "").startsWith("https://"),
    sameSite: "strict",
    path: "/",
    maxAge: s.maxAge,
  });
  return res;
}
