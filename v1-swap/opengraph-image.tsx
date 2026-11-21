import { ImageResponse } from "next/og";
import { getPublicPuzzleDb as getPublicPuzzle } from "@/lib/puzzleRepo";

// OGP画像: 空の盤面＋サイズだけ（元イラストは絶対に使わない）
// タイトル等の日本語を入れる場合は、日本語フォントファイルを読み込んで fonts に渡す
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPublicPuzzle(id);
  if (!p) return new ImageResponse(<div style={{ display: "flex" }}>404</div>, size);

  const cell = Math.floor(Math.min(440 / p.height, 760 / p.width));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f1e7", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", border: "4px solid #333", background: "#fff" }}>
          {Array.from({ length: p.height }, (_, y) => (
            <div key={y} style={{ display: "flex" }}>
              {Array.from({ length: p.width }, (_, x) => (
                <div key={x} style={{ width: cell, height: cell, border: "1px solid #ccc" }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 64, color: "#333" }}>
          <div style={{ display: "flex" }}>{`${p.width} x ${p.height}`}</div>
          <div style={{ display: "flex", fontSize: 40, color: "#777" }}>PICROSS</div>
        </div>
      </div>
    ),
    size,
  );
}
