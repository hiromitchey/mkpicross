import { createHmac, timingSafeEqual } from "node:crypto";

// 署名の共通処理。クリアトークン・画像の期限付きURL・作者セッションで使う
// 鍵は用途ごとに分ける（どれか1つが漏れても他に波及しない）
type KeyName = "CLEAR_TOKEN_SECRET" | "IMAGE_URL_SECRET" | "SESSION_SECRET";

function key(name: KeyName): string {
  const s = process.env[name];
  if (!s || s.length < 32) throw new Error(`${name}（32文字以上）が未設定`);
  return s;
}

export function sign(name: KeyName, payload: string): string {
  return createHmac("sha256", key(name)).update(payload).digest("base64url");
}

export function verify(name: KeyName, payload: string, sig: string): boolean {
  const a = Buffer.from(sign(name, payload));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
