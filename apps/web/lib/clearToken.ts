import { sign, verify } from "./hmac";

// クリアトークン: 「この問題のこの版を解いた」証明。DBなしで検証できる
// 形式: base64url(問題ID.版.発行時刻) + "." + 署名

export function issueClearToken(puzzleId: string, version: number): string {
  const payload = `${puzzleId}.${version}.${Date.now()}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign("CLEAR_TOKEN_SECRET", payload)}`;
}

export function verifyClearToken(token: string, puzzleId: string): { version: number } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const payload = Buffer.from(body, "base64url").toString();
  if (!verify("CLEAR_TOKEN_SECRET", payload, sig)) return null;
  const [id, version] = payload.split(".");
  return id === puzzleId ? { version: Number(version) } : null;
}
