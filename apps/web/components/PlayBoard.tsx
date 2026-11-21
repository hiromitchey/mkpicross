"use client";

import { encodeBits, isSolved, satisfiedLines, type Grid } from "@picross/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicPuzzle } from "@/lib/puzzleStore";

// プレイヤーの入力: 0 = 空, 1 = 塗り, 2 = ×（core の UNKNOWN / BLACK / WHITE と同じ値）
type Mark = 0 | 1 | 2;
const CS = 24; // 1マスの大きさ（SVG座標。表示サイズは viewBox で拡縮）

// クリア時に元の絵を取り出す。既定はサーバーで再判定（/play/[id]）。URL 共有では暗号を解く関数を渡す
type Unlock = (board: Grid) => Promise<string | null>;

function serverUnlock(id: string, version: number): Unlock {
  return async (board) => {
    try {
      const r = (await fetch(`/api/puzzles/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, board: encodeBits(board) }),
      }).then((r) => r.json())) as { ok: boolean; imageUrl?: string; clearToken?: string };
      if (!r.ok || !r.imageUrl) return null;
      try {
        localStorage.setItem(`picross:clear:${id}`, r.clearToken ?? "");
      } catch {}
      return r.imageUrl;
    } catch {
      return null;
    }
  };
}

const CONFETTI = ["🎉", "✨", "🎊", "⭐", "✨", "🎉", "💫", "🎊", "⭐", "✨"];

export default function PlayBoard(props: { puzzle: PublicPuzzle; saveKey?: string; unlock?: Unlock }) {
  const { puzzle } = props;
  const { id, version, width: W, height: H, clues, givens } = puzzle;
  const saveKey = props.saveKey ?? `picross:${id}:v${version}`;
  const locked = useMemo(() => new Set(givens.map((g) => g.y * W + g.x)), [givens, W]);

  const [cells, setCells] = useState<Uint8Array>(() => {
    const a = new Uint8Array(W * H);
    for (const g of givens) a[g.y * W + g.x] = g.state;
    return a;
  });
  const [history, setHistory] = useState<Uint8Array[]>([]);
  const [tool, setTool] = useState<1 | 2>(1); // スマホ用の塗り / × 切替
  const [image, setImage] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ from: Mark; value: Mark; x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const dirty = useRef(false); // プレイヤーが操作したか（操作するまで保存データを上書きしない）

  // 途中保存（キー = 問題ID＋版。版が変わったセーブは読まない）
  useEffect(() => {
    try {
      const s = localStorage.getItem(saveKey);
      const a = s ? Uint8Array.from(JSON.parse(s) as number[]) : null;
      // 端末内の保存データ（外部の状態）をハイドレーション後に1回だけ反映
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (a && a.length === W * H) setCells(a);
    } catch {}
  }, [saveKey, W, H]);
  useEffect(() => {
    if (!dirty.current) return;
    try {
      localStorage.setItem(saveKey, JSON.stringify(Array.from(cells)));
    } catch {}
  }, [saveKey, cells]);

  const grid: Grid = { width: W, height: H, cells };
  const sat = satisfiedLines(grid, clues);
  const solved = isSolved(grid, clues);

  // ヒントをすべて満たしたら盤面を固定して「おめでとう」→ 元の絵を取り出して浮かび上がらせる
  const unlockRef = useRef<Unlock>(props.unlock ?? serverUnlock(id, version));
  const unlocked = useRef(false);
  useEffect(() => {
    if (!solved || unlocked.current) return;
    unlocked.current = true;
    void unlockRef.current({ width: W, height: H, cells }).then((url) => url && setImage(url));
  }, [solved, W, H, cells]);

  // レイアウト（ヒント欄の幅・高さはヒントの最大個数から）
  const rowLen = Math.max(1, ...clues.rows.map((c) => c.length));
  const colLen = Math.max(1, ...clues.cols.map((c) => c.length));
  const left = rowLen * CS * 0.7 + 8;
  const top = colLen * CS * 0.7 + 8;

  // 画面座標 → マス座標（盤外はクランプ）
  const toCell = (e: React.PointerEvent) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: Math.floor((p.x - left) / CS), y: Math.floor((p.y - top) / CS) };
  };
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, v));

  // 始点から現在地までの直線をまとめて塗る（速いドラッグでもマスを飛ばさない）。
  // 始点と同じ状態（from）だったマスだけ変える: 塗りのドラッグで×を、×のドラッグで塗りを巻き込まない
  const paint = (x0: number, y0: number, x1: number, y1: number, from: Mark, value: Mark) => {
    dirty.current = true;
    setCells((prev) => {
      const next = new Uint8Array(prev);
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          const i = y * W + x;
          if (!locked.has(i) && (next[i] === from || next[i] === value)) next[i] = value;
        }
      return next;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const c = toCell(e);
    if (!c || solved || c.x < 0 || c.y < 0 || c.x >= W || c.y >= H) return;
    e.preventDefault();
    if (locked.has(c.y * W + c.x)) return; // 初期開示マスは変更不可
    // 盤面の外で指やボタンを離しても pointerup を受け取れるようにする（ドラッグが残り続けるのを防ぐ）
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = e.button === 2 ? 2 : tool; // 右クリック = ×
    const from = cells[c.y * W + c.x] as Mark;
    const value: Mark = from === t ? 0 : t; // 同じ状態なら消す
    setHistory((h) => [...h.slice(-99), cells]);
    drag.current = { from, value, x: c.x, y: c.y, axis: null };
    paint(c.x, c.y, c.x, c.y, from, value);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const c = d && toCell(e);
    if (!d || !c) return;
    const x = clamp(c.x, W);
    const y = clamp(c.y, H);
    if (!d.axis) {
      if (x !== d.x) d.axis = "x";
      else if (y !== d.y) d.axis = "y";
      else return;
    }
    // 始点の行・列に固定
    if (d.axis === "x") paint(d.x, d.y, x, d.y, d.from, d.value);
    else paint(d.x, d.y, d.x, y, d.from, d.value);
  };

  const undo = () => {
    if (!history.length) return;
    dirty.current = true;
    setCells(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  };

  const reset = () => {
    dirty.current = true;
    setHistory((h) => [...h.slice(-99), cells]);
    const a = new Uint8Array(W * H);
    for (const g of givens) a[g.y * W + g.x] = g.state;
    setCells(a);
  };

  const hint = (done: boolean) => (done ? "var(--hint-done)" : "currentColor");

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <button className={`rounded border px-3 py-1 ${tool === 1 ? "bg-gray-800 text-white" : ""}`} onClick={() => setTool(1)}>
          ■ 塗る
        </button>
        <button className={`rounded border px-3 py-1 ${tool === 2 ? "bg-gray-800 text-white" : ""}`} onClick={() => setTool(2)}>
          × 印
        </button>
        <button className="rounded border px-3 py-1" onClick={undo} disabled={!history.length || solved}>
          戻す
        </button>
        <button className="rounded border px-3 py-1" onClick={reset} disabled={solved}>
          最初から
        </button>
      </div>

      <div className="relative w-full max-w-[720px]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${left + W * CS + 2} ${top + H * CS + 2}`}
        className="w-full max-w-[720px] touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onContextMenu={(e) => e.preventDefault()}
        role="img"
        aria-label={`${W}×${H}のピクロス盤面`}
      >
        {clues.cols.map((c, x) =>
          (c.length ? c : [0]).map((n, k, arr) => (
            <text key={`c${x}-${k}`} x={left + x * CS + CS / 2} y={top - 6 - (arr.length - 1 - k) * CS * 0.7}
              textAnchor="middle" fontSize={CS * 0.55} fill={hint(sat.cols[x])}>
              {n}
            </text>
          )),
        )}
        {clues.rows.map((c, y) =>
          (c.length ? c : [0]).map((n, k, arr) => (
            <text key={`r${y}-${k}`} x={left - 8 - (arr.length - 1 - k) * CS * 0.7} y={top + y * CS + CS * 0.7}
              textAnchor="end" fontSize={CS * 0.55} fill={hint(sat.rows[y])}>
              {n}
            </text>
          )),
        )}
        {Array.from(cells, (v, i) => {
          const px = left + (i % W) * CS;
          const py = top + Math.floor(i / W) * CS;
          return (
            <g key={i}>
              <rect x={px} y={py} width={CS} height={CS} fill={v === 1 ? "#222" : "#fff"} stroke={solved ? "none" : "#bbb"} strokeWidth={0.5} />
              {v === 2 && !solved && (
                <path d={`M${px + 6} ${py + 6}L${px + CS - 6} ${py + CS - 6}M${px + CS - 6} ${py + 6}L${px + 6} ${py + CS - 6}`}
                  stroke="#888" strokeWidth={1.5} />
              )}
            </g>
          );
        })}
        {/* 5マスごとの太線と外枠（クリア後はドット絵として見せるため消す） */}
        {!solved && Array.from({ length: Math.floor(W / 5) + 1 }, (_, k) => (
          <line key={`v${k}`} x1={left + k * 5 * CS} x2={left + k * 5 * CS} y1={top} y2={top + H * CS} stroke="#555" strokeWidth={1.5} />
        ))}
        {!solved && Array.from({ length: Math.floor(H / 5) + 1 }, (_, k) => (
          <line key={`h${k}`} x1={left} x2={left + W * CS} y1={top + k * 5 * CS} y2={top + k * 5 * CS} stroke="#555" strokeWidth={1.5} />
        ))}
        <rect x={left} y={top} width={W * CS} height={H * CS} fill="none" stroke="#333" strokeWidth={2} />
        {image && (
          <image href={image} x={left} y={top} width={W * CS} height={H * CS} preserveAspectRatio="xMidYMid slice" className="reveal" />
        )}
      </svg>
      {solved && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {CONFETTI.map((c, k) => (
            <span key={k} className="confetti" style={{ left: `${5 + k * 9.5}%`, animationDelay: `${(k % 4) * 0.15}s` }}>
              {c}
            </span>
          ))}
          <div className="congrats">おめでとう！</div>
        </div>
      )}
      </div>

      {solved && (
        <p className="mt-3 text-lg font-bold" role="status">
          クリア！{image ? "" : "（これが答えのドット絵です）"}
        </p>
      )}
    </div>
  );
}
