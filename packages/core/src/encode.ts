import { BLACK, WHITE, type Grid } from "./types";

// 黒/白の盤面 ⇔ 行優先ビット列のbase64（30×30 → 113バイト → 152文字）
export function encodeBits(grid: Grid): string {
  const n = grid.width * grid.height;
  const bytes = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i++) {
    if (grid.cells[i] === BLACK) bytes[i >> 3] |= 0x80 >> (i & 7);
  }
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function decodeBits(b64: string, width: number, height: number): Grid {
  const bin = atob(b64);
  const n = width * height;
  if (bin.length !== Math.ceil(n / 8)) throw new Error("盤面データの長さが不正");
  const cells = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const bit = bin.charCodeAt(i >> 3) & (0x80 >> (i & 7));
    cells[i] = bit ? BLACK : WHITE;
  }
  return { width, height, cells };
}
