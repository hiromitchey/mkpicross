import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

// 共有ピクロスの預かり所: STORAGE_DIR/shares/<id>.txt に共有コード（lib/share.ts の形式）をそのまま置く。
// 中身はヒントと「答えを鍵にして暗号化した絵」だけなので、サーバー側でも絵は見えない
const DIR = path.join(process.env.STORAGE_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "storage"), "shares");
const ID_RE = /^[A-Za-z0-9]{8}$/;
const CODE_RE = /^[A-Za-z0-9_-]+$/;
export const MAX_CODE = 64 * 1024; // 絵 256px の WebP を暗号化しても 10KB 前後。余裕を見た上限

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // 見間違えやすい文字を除く

function newId(): string {
  const b = randomBytes(8);
  return Array.from(b, (n) => ALPHABET[n % ALPHABET.length]).join("");
}

// 形式チェック: 展開できて、ピクロスの問題として妥当な大きさか
export function isValidCode(code: unknown): code is string {
  if (typeof code !== "string" || code.length > MAX_CODE || !CODE_RE.test(code)) return false;
  try {
    const json = inflateRawSync(Buffer.from(code, "base64url"), { maxOutputLength: 256 * 1024 });
    const w = JSON.parse(json.toString("utf8")) as { v?: unknown; w?: unknown; h?: unknown; r?: unknown; c?: unknown };
    const size = (n: unknown) => Number.isInteger(n) && (n as number) >= 5 && (n as number) <= 30;
    return w.v === 1 && size(w.w) && size(w.h) && Array.isArray(w.r) && Array.isArray(w.c);
  } catch {
    return false;
  }
}

export async function saveShare(code: string): Promise<string> {
  await mkdir(DIR, { recursive: true });
  for (;;) {
    const id = newId();
    try {
      // wx = 同じ ID のファイルがあれば失敗（上書きしない）
      await writeFile(/*turbopackIgnore: true*/ path.join(DIR, `${id}.txt`), code, { flag: "wx" });
      return id;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
}

export async function loadShare(id: string): Promise<string | null> {
  if (!ID_RE.test(id)) return null;
  try {
    return await readFile(/*turbopackIgnore: true*/ path.join(DIR, `${id}.txt`), "utf8");
  } catch {
    return null;
  }
}

export const isShareId = (s: string) => ID_RE.test(s);
