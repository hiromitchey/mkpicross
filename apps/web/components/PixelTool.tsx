"use client";

import { BLACK, WHITE, blackRatio, convertImage, DEFAULT_PARAMS, hasTransparency, type ConvertParams, type Grid } from "@picross/core";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import SharePanel from "@/components/SharePanel";

// 画像 → 白黒ドット。変換本体は packages/core の convertImage、ここは画面だけ
const CS = 20; // ドット表示の1マス（SVG座標）
const WORK_MAX = 1024; // 変換にかける画像の最大辺

type Source = { bmp: ImageBitmap; url: string; name: string; transparent: boolean }; // transparent = 背景が抜いてある
type Crop = { cx: number; cy: number; zoom: number }; // 切り抜き枠の中心（0〜1）と倍率
type Rect = { x: number; y: number; w: number; h: number };

const CENTER: Crop = { cx: 0.5, cy: 0.5, zoom: 1 };
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// 切り抜き枠（元画像のピクセル座標）。縦横比 = マス数の縦横比、画像からはみ出さない
function cropRect(bw: number, bh: number, gw: number, gh: number, c: Crop): Rect {
  const target = gw / gh;
  let w = bw;
  let h = bh;
  if (w / h > target) w = h * target;
  else h = w / target;
  w /= c.zoom;
  h /= c.zoom;
  return { x: clamp(c.cx * bw - w / 2, 0, bw - w), y: clamp(c.cy * bh - h / 2, 0, bh - h), w, h };
}

// white = false なら透明のまま（シルエット用に透明度を残す）
function canvas2d(w: number, h: number, white = true) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  if (white) {
    ctx.fillStyle = "#fff"; // 透過は白
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return { canvas, ctx };
}

// 切り抜いた範囲を最大辺 WORK_MAX に縮めた RGBA（透明度つき。濃淡モードでは core 側で白と合成）
function toWorkImage(bmp: ImageBitmap, r: Rect): ImageData {
  const k = Math.min(1, WORK_MAX / Math.max(r.w, r.h));
  const { canvas, ctx } = canvas2d(r.w * k, r.h * k, false);
  ctx.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function loadSource(file: File): Promise<Source> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  // 画面表示用（向きを反映済みの縮小コピー）
  const k = Math.min(1, WORK_MAX / Math.max(bmp.width, bmp.height));
  const { canvas, ctx } = canvas2d(bmp.width * k, bmp.height * k, false);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const transparent = hasTransparency(ctx.getImageData(0, 0, canvas.width, canvas.height));
  ctx.globalCompositeOperation = "destination-over"; // 透明な所の下に白を敷く
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { bmp, url: canvas.toDataURL("image/jpeg", 0.85), name: file.name.replace(/\.[^.]+$/, "") || "image", transparent };
}

// 手修正: 変換結果の上にかぶせる「マス番号 → 色」。スライダーを動かしても消えない
type Edits = ReadonlyMap<number, number>;
type Hist = { past: Edits[]; now: Edits; future: Edits[] };
type Act =
  | { t: "begin" } // ひと筆の開始（ここまでの状態を「戻す」用に積む）
  | { t: "set"; cells: number[]; v: number }
  | { t: "undo" }
  | { t: "redo" }
  | { t: "clear" } // 手修正を全部消す（戻せる）
  | { t: "reset" }; // 画像・マス数が変わった（履歴ごと消す）

const NO_EDITS: Edits = new Map();
const EMPTY: Hist = { past: [], now: NO_EDITS, future: [] };

function reduce(h: Hist, a: Act): Hist {
  switch (a.t) {
    case "begin":
      return { past: [...h.past.slice(-99), h.now], now: h.now, future: [] };
    case "set": {
      if (a.cells.every((i) => h.now.get(i) === a.v)) return h;
      const now = new Map(h.now);
      for (const i of a.cells) now.set(i, a.v);
      return { ...h, now };
    }
    case "undo":
      return h.past.length ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] } : h;
    case "redo":
      return h.future.length ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) } : h;
    case "clear":
      return h.now.size ? { past: [...h.past.slice(-99), h.now], now: NO_EDITS, future: [] } : h;
    case "reset":
      return EMPTY;
  }
}

const btn =
  "rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-700 dark:hover:bg-neutral-800";
const btnOn = "bg-neutral-800 text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-black dark:hover:bg-neutral-300";
const card = "rounded-xl border border-neutral-200 p-4 dark:border-neutral-800";
const divider = "border-t border-neutral-200 pt-4 dark:border-neutral-800";

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step = 1, disabled, format, onChange } = props;
  return (
    <label className={`flex flex-col gap-1 text-sm ${disabled ? "opacity-40" : ""}`}>
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-neutral-500">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full accent-neutral-800 dark:accent-neutral-200"
      />
    </label>
  );
}

export default function PixelTool() {
  const [src, setSrc] = useState<Source | null>(null);
  const [params, setParams] = useState<ConvertParams>(DEFAULT_PARAMS);
  const [crop, setCrop] = useState<Crop>(CENTER);
  const [hist, dispatch] = useReducer(reduce, EMPTY);
  const [overlay, setOverlay] = useState(0); // 元画像を重ねる濃さ（0〜1）
  const [lines, setLines] = useState(true);
  const [scale, setScale] = useState(16); // PNG 保存時の1マスのピクセル数
  const [error, setError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [copied, setCopied] = useState(false);

  const accept = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const s = await loadSource(file);
      setSrc(s);
      // 背景抜きならシルエット、そうでなければ濃淡で始める（あとで切り替えられる）
      setParams((p) => ({ ...p, mode: s.transparent ? "silhouette" : "tone" }));
      setCrop(CENTER);
      dispatch({ t: "reset" });
      setError(null);
    } catch {
      setError("画像として読み込めませんでした（JPEG・PNG・WebP などに対応）");
    }
  }, []);

  // 貼り付け（Ctrl+V）でも読み込む
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (f) void accept(f);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [accept]);

  // Ctrl+Z / Ctrl+Y（Ctrl+Shift+Z）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      e.preventDefault();
      dispatch({ t: k === "y" || e.shiftKey ? "redo" : "undo" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { gridWidth: W, gridHeight: H } = params;
  const rect = useMemo(() => (src ? cropRect(src.bmp.width, src.bmp.height, W, H, crop) : null), [src, W, H, crop]);
  const work = useMemo(() => (src && rect ? toWorkImage(src.bmp, rect) : null), [src, rect]);
  const conv = useMemo(() => (work ? convertImage(work, params) : null), [work, params]);
  const grid = useMemo<Grid | null>(() => {
    if (!conv) return null;
    if (!hist.now.size) return conv.grid;
    const cells = new Uint8Array(conv.grid.cells);
    for (const [i, v] of hist.now) if (i < cells.length) cells[i] = v;
    return { ...conv.grid, cells };
  }, [conv, hist.now]);

  // 調整後のグレースケール（スライダーの効き具合を見る用）
  const grayRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = grayRef.current;
    if (!c || !work || !conv) return;
    c.width = work.width;
    c.height = work.height;
    const out = new ImageData(work.width, work.height);
    for (let i = 0; i < conv.adjusted.length; i++) {
      const v = conv.adjusted[i];
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
      out.data[i * 4 + 3] = 255;
    }
    c.getContext("2d")!.putImageData(out, 0, 0);
  }, [work, conv]);

  const setP = <K extends keyof ConvertParams>(k: K, v: ConvertParams[K]) => setParams((p) => ({ ...p, [k]: v }));
  // マス数を変えると手修正の位置が合わなくなるので消す
  const setSize = (w: number, h: number) => {
    setParams((p) => ({ ...p, gridWidth: w, gridHeight: h }));
    dispatch({ t: "reset" });
  };

  // --- 切り抜き枠のドラッグ ---
  const srcRef = useRef<SVGSVGElement>(null);
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const point = (svg: SVGSVGElement | null, e: React.PointerEvent) => {
    const m = svg?.getScreenCTM();
    return m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()) : null;
  };
  const moveCrop = (px: number, py: number) => {
    if (!src || !rect) return;
    const { width: bw, height: bh } = src.bmp;
    const cx = clamp(px, rect.w / 2, bw - rect.w / 2) / bw;
    const cy = clamp(py, rect.h / 2, bh - rect.h / 2) / bh;
    setCrop((c) => ({ ...c, cx, cy }));
  };
  const onCropDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = point(srcRef.current, e);
    if (!p || !rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const inside = p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
    // 枠の中をつかんだらそのまま動かす。外を押したら枠の中心をそこへ
    grab.current = inside ? { dx: p.x - (rect.x + rect.w / 2), dy: p.y - (rect.y + rect.h / 2) } : { dx: 0, dy: 0 };
    if (!inside) moveCrop(p.x, p.y);
  };
  const onCropMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = grab.current;
    const p = g && point(srcRef.current, e);
    if (g && p) moveCrop(p.x - g.dx, p.y - g.dy);
  };
  const endCrop = () => {
    grab.current = null;
  };

  // --- ドットの手修正（クリックで反転、ドラッグで同じ色を塗り続ける）---
  const dotRef = useRef<SVGSVGElement>(null);
  const stroke = useRef<{ v: number; x: number; y: number } | null>(null);
  const cellAt = (e: React.PointerEvent) => {
    const p = point(dotRef.current, e);
    return p ? { x: clamp(Math.floor(p.x / CS), 0, W - 1), y: clamp(Math.floor(p.y / CS), 0, H - 1) } : null;
  };
  const onDotDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const c = cellAt(e);
    if (!grid || !c || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const i = c.y * W + c.x;
    const v = grid.cells[i] === BLACK ? WHITE : BLACK;
    stroke.current = { v, ...c };
    dispatch({ t: "begin" });
    dispatch({ t: "set", cells: [i], v });
  };
  const onDotMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const s = stroke.current;
    const c = s && cellAt(e);
    if (!s || !c || (c.x === s.x && c.y === s.y)) return;
    // 前回のマスから今のマスまでを線でつなぐ（速く動かしても途切れない）
    const n = Math.max(Math.abs(c.x - s.x), Math.abs(c.y - s.y));
    const cells: number[] = [];
    for (let k = 1; k <= n; k++) {
      cells.push(Math.round(s.y + ((c.y - s.y) * k) / n) * W + Math.round(s.x + ((c.x - s.x) * k) / n));
    }
    stroke.current = { v: s.v, ...c };
    dispatch({ t: "set", cells, v: s.v });
  };
  const endStroke = () => {
    stroke.current = null;
  };

  // --- 書き出し ---
  const savePng = () => {
    if (!grid || !src) return;
    const { canvas, ctx } = canvas2d(W * scale, H * scale);
    ctx.fillStyle = "#000";
    grid.cells.forEach((v, i) => {
      if (v === BLACK) ctx.fillRect((i % W) * scale, Math.floor(i / W) * scale, scale, scale);
    });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${src.name}-${W}x${H}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };
  // 共有用の元の絵: 切り抜き枠の中を最大辺 256px に縮めた WebP（URL に入れるので小さく）
  const makeImage = async (): Promise<Blob | null> => {
    if (!src || !rect) return null;
    const k = Math.min(1, 256 / Math.max(rect.w, rect.h));
    const { canvas, ctx } = canvas2d(rect.w * k, rect.h * k);
    ctx.drawImage(src.bmp, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
    const blob = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
    const webp = await blob("image/webp", 0.7);
    // WebP で書き出せないブラウザは PNG になるので、そのときは JPEG にする
    return webp?.type === "image/webp" ? webp : blob("image/jpeg", 0.75);
  };

  const copyText = async () => {
    if (!grid) return;
    const rows = Array.from({ length: H }, (_, y) =>
      Array.from(grid.cells.subarray(y * W, (y + 1) * W), (v) => (v === BLACK ? "■" : "□")).join(""),
    );
    try {
      await navigator.clipboard.writeText(rows.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("クリップボードにコピーできませんでした");
    }
  };

  const picker = (
    <input
      type="file"
      accept="image/*"
      className="sr-only"
      aria-label="画像を選ぶ"
      onChange={(e) => {
        void accept(e.target.files?.[0]);
        e.target.value = ""; // 同じファイルをもう一度選べるように
      }}
    />
  );
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDropping(true);
    },
    onDragLeave: () => setDropping(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropping(false);
      void accept(e.dataTransfer.files[0]);
    },
  };

  if (!src || !rect || !grid || !conv) {
    return (
      <div {...dropProps}>
        <label
          className={`flex h-64 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center ${
            dropping ? "border-neutral-800 bg-neutral-100 dark:border-neutral-200 dark:bg-neutral-800" : "border-neutral-300 dark:border-neutral-700"
          }`}
        >
          {picker}
          <span className="text-lg font-bold">画像をここにドロップ</span>
          <span className="text-sm text-neutral-500">またはクリックして選ぶ・Ctrl+V で貼り付け</span>
        </label>
        {error && (
          <p role="alert" className="mt-3 text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }

  const { width: bw, height: bh } = src.bmp;
  const k = (W * CS) / rect.w; // 元画像のピクセル → ドット表示の座標
  const ratio = Math.round(blackRatio(grid) * 100);
  const auto = params.thresholdMode === "otsu";
  const silhouette = params.mode === "silhouette";

  return (
    <div {...dropProps} className={`flex flex-col gap-5 ${dropping ? "opacity-60" : ""}`}>
      <div className="grid gap-5 lg:grid-cols-2">
        {/* 左: 元画像と調整 */}
        <section className={`${card} flex flex-col gap-4`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">元画像</h2>
            <label className={`${btn} cursor-pointer`}>
              {picker}別の画像
            </label>
          </div>
          <svg
            ref={srcRef}
            viewBox={`0 0 ${bw} ${bh}`}
            className="max-h-80 w-full cursor-move touch-none select-none rounded-md bg-neutral-100 dark:bg-neutral-900"
            onPointerDown={onCropDown}
            onPointerMove={onCropMove}
            onPointerUp={endCrop}
            onPointerCancel={endCrop}
            role="img"
            aria-label="元画像と切り抜き枠（ドラッグで移動）"
            data-testid="source"
          >
            <image href={src.url} width={bw} height={bh} preserveAspectRatio="none" />
            <path d={`M0 0H${bw}V${bh}H0Z M${rect.x} ${rect.y}h${rect.w}v${rect.h}h${-rect.w}Z`} fillRule="evenodd" fill="rgba(0,0,0,0.55)" />
            <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="none" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
          <p className="-mt-2 text-xs text-neutral-500">明るい枠の中がドットになります。ドラッグで移動、「拡大」で範囲を絞れます。</p>

          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <Slider label="拡大" value={crop.zoom} min={1} max={8} step={0.1} format={(v) => `×${v.toFixed(1)}`} onChange={(v) => setCrop((c) => ({ ...c, zoom: v }))} />
            <div className="flex items-end justify-end">
              <button className={btn} onClick={() => setCrop(CENTER)} disabled={crop === CENTER}>
                切り抜きを戻す
              </button>
            </div>
            <Slider label="幅（マス）" value={W} min={5} max={30} onChange={(v) => setSize(v, H)} />
            <Slider label="高さ（マス）" value={H} min={5} max={30} onChange={(v) => setSize(W, v)} />
            <div className="col-span-2 flex flex-wrap gap-2">
              {[10, 15, 20, 25, 30].map((n) => (
                <button key={n} className={`${btn} ${W === n && H === n ? btnOn : ""}`} onClick={() => setSize(n, n)}>
                  {n}×{n}
                </button>
              ))}
            </div>
          </div>

          <div className={`grid grid-cols-2 gap-x-5 gap-y-3 ${divider}`}>
            <div className="col-span-2 flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-2" role="group" aria-label="変換のしかた">
                <button className={`${btn} ${!silhouette ? btnOn : ""}`} aria-pressed={!silhouette} onClick={() => setP("mode", "tone")}>
                  濃淡で変換
                </button>
                <button className={`${btn} ${silhouette ? btnOn : ""}`} aria-pressed={silhouette} onClick={() => setP("mode", "silhouette")}>
                  シルエット
                </button>
              </div>
              <p className="text-xs text-neutral-500">
                {silhouette
                  ? src.transparent
                    ? "透過していない所を、色に関係なく黒にします。"
                    : "この画像には透過部分がないため、全部黒になります。背景を抜いた PNG で使ってください。"
                  : "明るさで白黒を分けます。"}
              </p>
            </div>
            <Slider label="コントラスト" disabled={silhouette} value={params.contrast} min={0.5} max={3} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => setP("contrast", v)} />
            <Slider label="明るさ" disabled={silhouette} value={params.brightness} min={-100} max={100} format={(v) => (v > 0 ? `+${v}` : `${v}`)} onChange={(v) => setP("brightness", v)} />
            <Slider label="ガンマ" disabled={silhouette} value={params.gamma} min={0.5} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => setP("gamma", v)} />
            <Slider label={auto ? "しきい値（自動）" : "しきい値"} disabled={auto} value={auto ? conv.threshold : params.threshold} min={0} max={255} onChange={(v) => setP("threshold", v)} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setParams((p) => ({ ...p, thresholdMode: e.target.checked ? "otsu" : "fixed", threshold: conv.threshold }))}
              />
              しきい値を自動で決める
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={params.invert} onChange={(e) => setP("invert", e.target.checked)} />
              白黒を反転
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={params.denoise} onChange={(e) => setP("denoise", e.target.checked)} />
              孤立した点を消す
            </label>
            <div className="flex justify-end">
              <button className={btn} onClick={() => setParams((p) => ({ ...DEFAULT_PARAMS, mode: p.mode, gridWidth: p.gridWidth, gridHeight: p.gridHeight }))}>
                調整を戻す
              </button>
            </div>
          </div>

          <div className={`flex items-start gap-3 ${divider}`}>
            <canvas ref={grayRef} className="w-28 shrink-0 rounded-md border border-neutral-200 dark:border-neutral-800" aria-label="調整後の濃淡" />
            <p className="text-xs text-neutral-500">
              {silhouette ? "透明度を濃淡にしたものです（黒 = 不透明）。" : "調整後の濃淡です。"}
              しきい値（{conv.threshold}）より暗いところが黒いドットになります。
            </p>
          </div>
        </section>

        {/* 右: ドット結果 */}
        <section className={`${card} flex flex-col gap-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">ドット</h2>
            <p className="text-sm tabular-nums text-neutral-500" data-testid="dot-stats">
              {W}×{H}・黒 {ratio}%{hist.now.size > 0 && `・手修正 ${hist.now.size} マス`}
            </p>
          </div>
          <svg
            ref={dotRef}
            viewBox={`0 0 ${W * CS} ${H * CS}`}
            className="w-full max-w-[560px] cursor-crosshair touch-none select-none self-center border border-neutral-400"
            onPointerDown={onDotDown}
            onPointerMove={onDotMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            role="img"
            aria-label={`${W}×${H}のドット（クリックで白黒を反転）`}
            data-testid="dot-grid"
          >
            <rect width={W * CS} height={H * CS} fill="#fff" />
            {Array.from(grid.cells, (v, i) =>
              v === BLACK ? <rect key={i} x={(i % W) * CS} y={Math.floor(i / W) * CS} width={CS} height={CS} fill="#111" /> : null,
            )}
            {overlay > 0 && (
              <image href={src.url} x={-rect.x * k} y={-rect.y * k} width={bw * k} height={bh * k} preserveAspectRatio="none" opacity={overlay} pointerEvents="none" />
            )}
            {lines && (
              <g pointerEvents="none" stroke="#888">
                {Array.from({ length: W - 1 }, (_, x) => (
                  <line key={`v${x}`} x1={(x + 1) * CS} x2={(x + 1) * CS} y1={0} y2={H * CS} strokeWidth={(x + 1) % 5 ? 0.4 : 1.4} />
                ))}
                {Array.from({ length: H - 1 }, (_, y) => (
                  <line key={`h${y}`} y1={(y + 1) * CS} y2={(y + 1) * CS} x1={0} x2={W * CS} strokeWidth={(y + 1) % 5 ? 0.4 : 1.4} />
                ))}
              </g>
            )}
          </svg>
          <p className="-mt-2 text-xs text-neutral-500">クリックで白黒を反転、ドラッグで続けて塗れます。手修正はスライダーを動かしても残ります。</p>

          <div className="flex flex-wrap items-center gap-2">
            <button className={btn} onClick={() => dispatch({ t: "undo" })} disabled={!hist.past.length}>
              戻す
            </button>
            <button className={btn} onClick={() => dispatch({ t: "redo" })} disabled={!hist.future.length}>
              やり直す
            </button>
            <button className={btn} onClick={() => dispatch({ t: "clear" })} disabled={!hist.now.size}>
              手修正を消す
            </button>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <input type="checkbox" checked={lines} onChange={(e) => setLines(e.target.checked)} />
              マス目
            </label>
          </div>
          <Slider label="元画像を重ねる" value={overlay} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={setOverlay} />

          <div className={`flex flex-wrap items-center gap-2 ${divider}`}>
            <button className={`${btn} ${btnOn}`} onClick={savePng}>
              PNG で保存
            </button>
            <label className="flex items-center gap-2 text-sm">
              1マス
              <select
                value={scale}
                onChange={(e) => setScale(+e.target.value)}
                className="rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700"
              >
                {[1, 8, 16, 32].map((n) => (
                  <option key={n} value={n} className="text-black">
                    {n}px
                  </option>
                ))}
              </select>
            </label>
            <span className="text-sm tabular-nums text-neutral-500">
              {W * scale}×{H * scale}px
            </span>
            <button className={`${btn} ml-auto`} onClick={copyText}>
              {copied ? "コピーしました" : "■□ でコピー"}
            </button>
          </div>
        </section>
      </div>
      <SharePanel grid={grid} makeImage={makeImage} />
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
