import { timingSafeEqual } from "node:crypto";
import { sign, verify } from "./hmac";

// v1 の作者認証: 環境変数のパスワード＋署名付きCookie（作者は運営者のみ）
export const SESSION_COOKIE = "author_session";
const TTL_SEC = 60 * 60 * 24 * 7; // 7日

export function checkPassword(input: string): boolean {
  const expected = Buffer.from(process.env.AUTHOR_PASSWORD ?? "");
  const actual = Buffer.from(input);
  return expected.length >= 12 && expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function issueSession(): { value: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  return { value: `${exp}.${sign("SESSION_SECRET", `author.${exp}`)}`, maxAge: TTL_SEC };
}

export function isValidSession(value: string | undefined): boolean {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return verify("SESSION_SECRET", `author.${exp}`, sig);
}
