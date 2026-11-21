"use client";

import {
  BLACK,
  convertImage,
  DEFAULT_PARAMS,
  encodeBits,
  UNKNOWN,
  WHITE,
  type Clues,
  type ConvertParams,
  type GivenCell,
  type Grid,
  type RGBAImage,
  type SolveResult,
} from "@picross/core";
import { useEffect, useState } from "react";
import { useSolverWorker } from "@/lib/useSolverWorker";

type Check = { clues: Clues; result: SolveResult; blackRatio: number; difficulty: number };
type GivensResult = { givens: GivenCell[]; solvable: boolean; result: SolveResult; difficulty: number };

const CS = 16;

// 画像ファイル → 最大辺1024px、グリッドの縦横比で中央を切り抜いた RGBA
async function loadImage(file: File, gw: number, gh: number): Promise<RGBAImage> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const target = gw / gh;
  let sw = bmp.width;
  let sh = bmp.height;
  if (sw / sh > target) sw = Math.round(sh * target);
  else sh = Math.round(sw / target);
  const scale = Math.min(1, 1024 / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff"; // 透過は白
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

export default function AuthorTool() {
  const run = useSolverWorker();
  const [file, setFile] = useState<File | null>(null);
  const [params, setParams] = useState<ConvertParams>(DEFAULT_PARAMS);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [givens, setGivens] = useState<GivenCell[]>([]);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ファイル・パラメータが変わるたびに変換し直す（検証結果はリセット）
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    loadImage(file, params.gridWidth, params.gridHeight).then((img) => {
      if (cancelled) return;
      setGrid(convertImage(img, params).grid);
      setCheck(null);
      setGivens([]);
    });
    return () => {
      cancelled = true;
    };
  }, [file, params]);

  const toggle = (i: number) => {
    if (!grid) return;
    const cells = new Uint8Array(grid.cells);
    cells[i] = cells[i] === BLACK ? WHITE : BLACK;
    setGrid({ ...grid, cells });
    setCheck(null);
    setGivens([]);
  };

  const verify = async () => {
    if (!grid) return;
    setBusy(true);
    setError(null);
    try {
      setCheck(await run<Check>({ mode: "check", grid }));
    } catch {
      setError("検証が時間内に終わりませんでした。コントラストを上げる・マス数を減らすなど、絵を整理してから再実行してください");
    } finally {
      setBusy(false);
    }
  };

  const addGivens = async () => {
    if (!grid) return;
    setBusy(true);
    try {
      const r = await run<GivensResult>({ mode: "givens", grid });
      setGivens(r.givens);
      setCheck((c) => (c ? { ...c, result: r.result, difficulty: r.difficulty } : c));
      if (!r.solvable) setError("開示マスが上限（20マス）を超えます。絵を修正するか、マス数・コントラストを変えてください");
    } catch {
      setError("一意化が時間内に終わりませんでした。絵を整理してから再実行してください");
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!file) return;
    setError(null);
    try {
      // 送信前にブラウザで最大辺2048pxへ縮小（通信量とサーバー負荷を抑える。EXIF もここで落ちる）
      // 透過部分は白で埋めて JPEG に（変換時の「透過 = 白」と同じ扱い）
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
      const fd = new FormData();
      fd.append("file", blob ?? file, "upload.jpg");
      const r = await fetch("/api/author/images", { method: "POST", body: fd }).then((r) => r.json());
      if (r.key) setImageKey(r.key);
      else setError(`画像を保存できませんでした: ${r.error ?? "不明なエラー"}`);
    } catch {
      setError("画像を保存できませんでした（読み込みまたは通信のエラー）");
    }
  };

  // MVP: 問題JSONを書き出す（data/puzzles に置く）
  const exportJson = () => {
    if (!grid || !check) return;
    // id は英小文字・数字・ハイフンのみ。日本語タイトルなどで空になったら日時から作る
    const id = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `p-${Date.now()}`;
    const json = {
      id, title: title || id, version: 1, width: grid.width, height: grid.height,
      clues: check.clues, givens, difficulty: check.difficulty,
      solution: encodeBits(grid), image: imageKey ?? `${id}.webp`,
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }));
    a.download = `${id}.json`;
    a.click();
  };

  const set = <K extends keyof ConvertParams>(k: K, v: ConvertParams[K]) => setParams((p) => ({ ...p, [k]: v }));
  // マス数は 5〜30 に収める（入力途中の「2」や空欄でも変換が壊れない）
  const size = (v: string) => Math.min(30, Math.max(5, Math.round(Number(v)) || 5));
  const r = check?.result;
  const publishable = r?.status === "unique" && r.level <= 2;
  const givenSet = new Set(givens.map((g) => g.y * (grid?.width ?? 0) + g.x));

  return (
    <div className="flex flex-col gap-4">
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="イラスト画像" />

      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <label>幅 <input type="number" min={5} max={30} value={params.gridWidth} onChange={(e) => set("gridWidth", size(e.target.value))} className="w-16 border" /></label>
        <label>高さ <input type="number" min={5} max={30} value={params.gridHeight} onChange={(e) => set("gridHeight", size(e.target.value))} className="w-16 border" /></label>
        <label>コントラスト <input type="range" min={0.5} max={3} step={0.1} value={params.contrast} onChange={(e) => set("contrast", +e.target.value)} /></label>
        <label>明るさ <input type="range" min={-100} max={100} value={params.brightness} onChange={(e) => set("brightness", +e.target.value)} /></label>
        <label><input type="checkbox" checked={params.invert} onChange={(e) => set("invert", e.target.checked)} /> 反転</label>
        <label><input type="checkbox" checked={params.denoise} onChange={(e) => set("denoise", e.target.checked)} /> 孤立点除去</label>
      </div>

      {grid && (
        <svg viewBox={`0 0 ${grid.width * CS} ${grid.height * CS}`} className="w-full max-w-[480px] border" data-testid="author-grid">
          {Array.from(grid.cells, (v, i) => {
            const x = (i % grid.width) * CS;
            const y = Math.floor(i / grid.width) * CS;
            const unresolved = r && r.deduced.cells[i] === UNKNOWN && !givenSet.has(i);
            return (
              <rect key={i} x={x} y={y} width={CS} height={CS} onClick={() => toggle(i)}
                fill={v === BLACK ? "#222" : "#fff"}
                stroke={givenSet.has(i) ? "#2563eb" : unresolved ? "#dc2626" : "#ccc"}
                strokeWidth={givenSet.has(i) || unresolved ? 2 : 0.5} />
            );
          })}
        </svg>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="rounded border px-3 py-1" onClick={verify} disabled={!grid || busy}>検証</button>
        <button className="rounded border px-3 py-1" onClick={addGivens} disabled={!r || publishable || busy}>開示マスで一意化</button>
        <button className="rounded border px-3 py-1" onClick={upload} disabled={!file}>画像を保存</button>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="タイトル" className="border px-2" />
        <button className="rounded border px-3 py-1" onClick={exportJson} disabled={!publishable}>JSON書き出し</button>
      </div>

      {busy && <p>検証中…</p>}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {check && r && (
        <p data-testid="check-result">
          {publishable ? "公開可" : "公開不可"}（{r.status}・レベル{r.level}・未確定{r.unresolved}マス・黒率
          {Math.round(check.blackRatio * 100)}%・★{check.difficulty}
          {givens.length > 0 && `・開示${givens.length}マス`}）
        </p>
      )}
      {imageKey && <p data-testid="image-key">保存済み: {imageKey}</p>}
    </div>
  );
}
