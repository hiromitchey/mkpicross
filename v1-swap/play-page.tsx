import { notFound } from "next/navigation";
import { Suspense } from "react";
import PlayBoard from "@/components/PlayBoard";
import { getPublicPuzzleDb } from "@/lib/puzzleRepo";

// v1: DB の問題はビルド時に ID が分からないので、params の読み出しを Suspense の内側に置く
export default function PlayPage({ params }: PageProps<"/play/[id]">) {
  return (
    <main className="mx-auto max-w-3xl p-4">
      <Suspense fallback={<p>読み込み中…</p>}>
        <Play params={params} />
      </Suspense>
    </main>
  );
}

async function Play({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPublicPuzzleDb(id);
  if (!p) notFound();
  return (
    <>
      <h1 className="mb-1 text-xl font-bold">{p.title}</h1>
      <p className="mb-4 text-sm text-gray-500">
        {p.width}×{p.height}・難易度 {"★".repeat(p.difficulty)}
      </p>
      <PlayBoard key={`${p.id}:${p.version}`} puzzle={p} />
    </>
  );
}
