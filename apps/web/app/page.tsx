import PixelTool from "@/components/PixelTool";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold">画像 → ドット変換</h1>
      <p className="mb-5 mt-1 text-sm text-neutral-500">
        画像を白黒のドットに変換します。処理はすべてブラウザ内で行い、画像はどこにも送信しません。
      </p>
      <PixelTool />
    </main>
  );
}
