import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/authorSession";

// 作者画面・作者APIの入口チェック（Next.js 16 で middleware.ts から proxy.ts に改名）
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/author/login" || pathname === "/api/author/login") return NextResponse.next();
  if (isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/author/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/author/:path*", "/api/author/:path*"],
};
