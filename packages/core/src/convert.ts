import { BLACK, WHITE, type Grid } from "./types";

// ブラウザの ImageData と同じ形（Canvas に依存しないので Node でもテスト可）
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

export interface ConvertParams {
  mode: "tone" | "silhouette"; // tone = 明暗で白黒 / silhouette = 透過していない所を黒
  gridWidth: number; // 5〜30
  gridHeight: number; // 5〜30
  gamma: number; // 0.5〜2.0
  contrast: number; // 0.5〜3.0
  brightness: number; // -100〜100
  thresholdMode: "otsu" | "fixed";
  threshold: number; // 0〜255（fixed のとき）
  invert: boolean;
  denoise: boolean;
}

export const DEFAULT_PARAMS: ConvertParams = {
  mode: "tone",
  gridWidth: 15,
  gridHeight: 15,
  gamma: 1.0,
  contrast: 1.5,
  brightness: 0,
  thresholdMode: "otsu",
  threshold: 128,
  invert: false,
  denoise: true,
};

// 3. グレースケール化（透過は白で合成）
export function toGray(img: RGBAImage): Float32Array {
  const g = new Float32Array(img.width * img.height);
  const d = img.data;
  for (let i = 0; i < g.length; i++) {
    const a = d[i * 4 + 3] / 255;
    const y = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    g[i] = y * a + 255 * (1 - a);
  }
  return g;
}

// シルエット用: 不透明 = 0（黒）、完全に透明 = 255（白）。色は見ない
export function alphaGray(img: RGBAImage): Float32Array {
  const g = new Float32Array(img.width * img.height);
  for (let i = 0; i < g.length; i++) g[i] = 255 - img.data[i * 4 + 3];
  return g;
}

// 透過している画素が全体の 1% 以上あれば「背景抜きの画像」とみなす
export function hasTransparency(img: RGBAImage): boolean {
  let n = 0;
  const total = img.width * img.height;
  for (let i = 0; i < total; i++) if (img.data[i * 4 + 3] < 250) n++;
  return n >= total * 0.01;
}

// 4. 階調調整: ガンマ → コントラスト → 明るさ
export function adjust(gray: Float32Array, p: Pick<ConvertParams, "gamma" | "contrast" | "brightness">): Float32Array {
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    let v = 255 * Math.pow(gray[i] / 255, p.gamma);
    v = (v - 128) * p.contrast + 128;
    v += p.brightness;
    out[i] = Math.min(255, Math.max(0, v));
  }
  return out;
}

// 5. 大津法: クラス間分散が最大になるしきい値（この値以下 = 黒）
export function otsuThreshold(gray: Float32Array): number {
  const hist = new Float64Array(256);
  for (const v of gray) hist[Math.round(v)]++;
  const total = gray.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestT = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return bestT;
}

// 6. 面積平均で縮小（端数のマスは重なり面積で按分）
export function resizeArea(gray: Float32Array, w: number, h: number, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H);
  const sx = w / W;
  const sy = h / H;
  for (let Y = 0; Y < H; Y++) {
    const y0 = Y * sy;
    const y1 = y0 + sy;
    for (let X = 0; X < W; X++) {
      const x0 = X * sx;
      const x1 = x0 + sx;
      let sum = 0;
      let area = 0;
      for (let y = Math.floor(y0); y < Math.min(h, Math.ceil(y1)); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.min(w, Math.ceil(x1)); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          sum += gray[y * w + x] * wx * wy;
          area += wx * wy;
        }
      }
      out[Y * W + X] = sum / area;
    }
  }
  return out;
}

// 8. 孤立点除去: 盤内の8近傍がすべて逆色のマスを反転
export function denoise(grid: Grid): Grid {
  const { width: W, height: H } = grid;
  const out = new Uint8Array(grid.cells);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = grid.cells[y * W + x];
      let same = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          count++;
          if (grid.cells[ny * W + nx] === v) same++;
        }
      }
      if (count > 0 && same === 0) out[y * W + x] = v === BLACK ? WHITE : BLACK;
    }
  }
  return { width: W, height: H, cells: out };
}

// 3〜8 をまとめて実行（トリミング済みの画像を渡す）
export function convertImage(img: RGBAImage, p: ConvertParams): { grid: Grid; threshold: number; adjusted: Float32Array } {
  // シルエットは透明度だけで決めるので、明暗の調整はかけない
  const adjusted = p.mode === "silhouette" ? alphaGray(img) : adjust(toGray(img), p);
  // シルエットの自動しきい値は 128 = マスの半分以上が不透明なら黒
  // （透明度は 0 と 255 にほぼ二分されるので、大津法だと 0 に寄って輪郭のマスが全部白になる）
  const auto = p.mode === "silhouette" ? 128 : otsuThreshold(adjusted);
  const threshold = p.thresholdMode === "otsu" ? auto : p.threshold;
  const small = resizeArea(adjusted, img.width, img.height, p.gridWidth, p.gridHeight);
  const cells = new Uint8Array(p.gridWidth * p.gridHeight);
  for (let i = 0; i < cells.length; i++) {
    const black = small[i] <= threshold;
    cells[i] = black !== p.invert ? BLACK : WHITE;
  }
  let grid: Grid = { width: p.gridWidth, height: p.gridHeight, cells };
  if (p.denoise) grid = denoise(grid);
  return { grid, threshold, adjusted }; // adjusted = 階調調整後のグレースケール（プレビュー用）
}

export function blackRatio(grid: Grid): number {
  let n = 0;
  for (const c of grid.cells) if (c === BLACK) n++;
  return n / grid.cells.length;
}
