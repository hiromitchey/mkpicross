import sharp from "sharp";
import { saveImage, signedImageUrl } from "@/lib/storage";

const MAX_BYTES = 10 * 1024 * 1024;

// POST /api/author/images  (multipart: file)  作者のみ（proxy.ts で保護）
// 中身でデコード → 回転を適用 → 最大辺1600px → WebP に再エンコード（EXIF・位置情報はここで消える）
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "file がありません" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "10MB を超えています" }, { status: 413 });

  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return Response.json({ error: "画像として読み込めません" }, { status: 415 });
  }
  const key = await saveImage(webp);
  return Response.json({ key, previewUrl: signedImageUrl(key) });
}
