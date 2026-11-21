import { notFound } from "next/navigation";
import PlayBoard from "@/components/PlayBoard";
import { getPublicPuzzle, listPuzzleIds } from "@/lib/puzzleStore";

export async function generateStaticParams() {
  return (await listPuzzleIds()).map((id) => ({ id }));
}

export default async function PlayPage({ params }: PageProps<"/play/[id]">) {
  const { id } = await params;
  const p = await getPublicPuzzle(id);
  if (!p) notFound();
  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="mb-1 text-xl font-bold">{p.title}</h1>
      <p className="mb-4 text-sm text-gray-500">
        {p.width}×{p.height}・難易度 {"★".repeat(p.difficulty)}
      </p>
      <PlayBoard key={`${p.id}:${p.version}`} puzzle={p} />
    </main>
  );
}
