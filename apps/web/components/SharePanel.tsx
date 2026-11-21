"use client";

import { encodeBits, type GivenCell, type Grid } from "@picross/core";
import { useState } from "react";
import { makeShareCode } from "@/lib/share";
import { useSolverWorker } from "@/lib/useSolverWorker";

const btn =
  "rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-700 dark:hover:bg-neutral-800";
const btnOn = "bg-neutral-800 text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-black dark:hover:bg-neutral-300";

type Made = { url: string; key: string; givens: number };
type Status = { t: "idle" } | { t: "working" } | { t: "error"; msg: string } | { t: "ready"; made: Made };

// ドット → 答えが1つに決まるか確かめて、URL で送れるピクロスにする
export default function SharePanel({ grid, makeImage }: { grid: Grid; makeImage: () => Promise<Blob | null> }) {
  const solver = useSolverWorker();
  const [title, setTitle] = useState("");
  const [withImage, setWithImage] = useState(true);
  const [status, setStatus] = useState<Status>({ t: "idle" });
  const [copied, setCopied] = useState(false);

  // 作った後でドット・題名・絵の有無を変えたら、作り直しが必要
  const key = `${grid.width}x${grid.height}:${encodeBits(grid)}:${withImage}:${title}`;
  const made = status.t === "ready" ? status.made : null;
  const stale = made !== null && made.key !== key;

  const make = async () => {
    setStatus({ t: "working" });
    try {
      // 推測なしで解けるように、必要なら最初から開けておくマス（初期開示）を選ぶ
      const r = await solver<{ givens: GivenCell[]; solvable: boolean }>({ mode: "givens", grid });
      if (!r.solvable) {
        setStatus({ t: "error", msg: "答えが1つに決まりませんでした。ドットを手直しするか、マス数を変えてみてください。" });
        return;
      }
      const image = withImage ? await makeImage() : null;
      const code = await makeShareCode(grid, r.givens, title.trim(), image);
      // サーバーに預けて短い URL にする（預けるのはヒントと暗号化済みの絵だけ）
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error(`share ${res.status}`);
      const { id } = (await res.json()) as { id: string };
      setStatus({ t: "ready", made: { url: `${location.origin}/p#${id}`, key, givens: r.givens.length } });
    } catch {
      setStatus({ t: "error", msg: "ピクロスを作れませんでした。ドットを少し減らすか、マス数を小さくしてみてください。" });
    }
  };

  const copy = async () => {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setStatus({ t: "error", msg: "クリップボードにコピーできませんでした" });
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="font-bold">ピクロスにして送る</h2>
      <p className="text-xs text-neutral-500">
        いまのドットを答えにしたピクロスの URL を作ります。サーバーに預けるのはヒントの数字と、答えの盤面を鍵にして暗号化した元の絵だけです。
        解くと「おめでとう」のあとに元の絵が浮かび上がります。
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          題名
          <input
            value={title}
            maxLength={40}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="（なしでもOK）"
            className="w-48 rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} />
          解いたら元の絵を見せる
        </label>
        <button className={`${btn} ${btnOn} ml-auto`} onClick={make} disabled={status.t === "working"}>
          {status.t === "working" ? "確認中…" : made ? "作り直す" : "ピクロスを作る"}
        </button>
      </div>
      <p className="text-xs text-neutral-500">題名は解く人に見えます。答えが分かる題名は避けてください。</p>

      {status.t === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {status.msg}
        </p>
      )}
      {made && (
        <div className={`flex flex-col gap-2 ${stale ? "opacity-50" : ""}`}>
          {stale && <p className="text-sm text-amber-700 dark:text-amber-400">作ったあとに内容を変えたので、「作り直す」を押してください。</p>}
          <p className="text-sm">
            できました。答えは1つに決まります{made.givens > 0 && `（${made.givens} マスを最初から開けておきます）`}。
          </p>
          <input
            readOnly
            value={made.url}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 font-mono text-xs dark:border-neutral-700"
            aria-label="共有用の URL"
            data-testid="share-url"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button className={btn} onClick={copy} disabled={stale}>
              {copied ? "コピーしました" : "URL をコピー"}
            </button>
            <a className={btn} href={made.url} target="_blank" rel="noopener">
              自分で解いてみる
            </a>
          </div>
          <p className="text-xs text-neutral-500">
            友だちが開くには、このサイトがインターネットに公開されている必要があります（いまは localhost なので、このPCでしか開けません）。
          </p>
        </div>
      )}
    </section>
  );
}
