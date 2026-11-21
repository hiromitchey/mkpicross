import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sign, verify } from "./hmac";

// 表示用イラストの保存先: VPS の Docker ボリューム（STORAGE_DIR）。
// 公開ディレクトリには置かず、署名付きの期限付きURL経由でだけ配信する。
// S3互換（Cloudflare R2 など）に移すときは、このファイルの3関数だけ差し替える。
// 実行時に決まる外部ディレクトリなので、ビルド時のファイル追跡から外す（turbopackIgnore）
const DIR = process.env.STORAGE_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "storage");
const KEY_RE = /^[0-9a-f-]{36}\.webp$/;

export async function saveImage(webp: Buffer): Promise<string> {
  const key = `${randomUUID()}.webp`;
  await mkdir(DIR, { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ path.join(DIR, key), webp);
  return key;
}

export async function readImage(key: string): Promise<Buffer | null> {
  if (!KEY_RE.test(key)) return null;
  try {
    return await readFile(/*turbopackIgnore: true*/ path.join(DIR, key));
  } catch {
    return null;
  }
}

export function signedImageUrl(key: string, ttlSec = 600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = sign("IMAGE_URL_SECRET", `${key}.${exp}`);
  return `/api/images/${key}?exp=${exp}&sig=${sig}`;
}

export function checkImageSig(key: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return verify("IMAGE_URL_SECRET", `${key}.${exp}`, sig);
}
