"use client";

import { useEffect, useState } from "react";
import PlayBoard from "@/components/PlayBoard";
import { openSealed, readShareCode, shortHash, type SharedPuzzle } from "@/lib/share";

// URL の # 以降から問題を読んで遊ぶ。# 以降はサーバーに送られないので、問題はこのブラウザの中だけで扱う
export default function SharedPlay() {
  const [state, setState] = useState<{ code: string; puzzle: SharedPuzzle } | "loading" | "empty" | "broken">("loading");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const hash = location.hash.slice(1);
      if (!hash) return setState("empty");
      // 短い ID（8文字）ならサーバーに預けた共有コードを取りに行く。長ければコードそのもの
      const code = /^[A-Za-z0-9]{8}$/.test(hash)
        ? await fetch(`/api/shares/${hash}`)
            .then((r) => (r.ok ? (r.json() as Promise<{ code: string }>) : null))
            .then((r) => r?.code ?? "")
            .catch(() => "")
        : hash;
      const puzzle = code ? await readShareCode(code) : null;
      if (alive) setState(puzzle ? { code, puzzle } : "broken");
    };
    void load();
    window.addEventListener("hashchange", load);
    return () => {
      alive = false;
      window.removeEventListener("hashchange", load);
    };
  }, []);

  if (state === "loading") return <p className="text-neutral-500">読み込み中…</p>;
  if (state === "empty") return <p>問題のリンクから開いてください。</p>;
  if (state === "broken") return <p role="alert">問題を読み込めませんでした。リンクが途中で切れていないか確認してください。</p>;

  const { code, puzzle: p } = state;
  const id = `share-${shortHash(code)}`;
  return (
    <>
      <h1 className="mb-1 text-xl font-bold">{p.title || "ピクロス"}</h1>
      <p className="mb-4 text-sm text-neutral-500">
        {p.width}×{p.height}
        {p.sealed && "・解くと絵が出てきます"}
      </p>
      <PlayBoard
        key={id}
        puzzle={{ id, title: p.title, version: 1, width: p.width, height: p.height, clues: p.clues, givens: p.givens, difficulty: 0 }}
        saveKey={`picross:${id}`}
        unlock={async (board) => {
          if (!p.sealed) return null;
          const blob = await openSealed(p.sealed, board);
          return blob ? URL.createObjectURL(blob) : null;
        }}
      />
    </>
  );
}
