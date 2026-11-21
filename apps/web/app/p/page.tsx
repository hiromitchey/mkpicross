import type { Metadata } from "next";
import SharedPlay from "@/components/SharedPlay";

// URL で送られてきたピクロス（/p#<問題コード>）。中身はすべてブラウザ側で読む
export const metadata: Metadata = {
  title: "ピクロス",
  description: "解くと絵が出てくるピクロス",
  robots: { index: false },
};

export default function SharedPlayPage() {
  return (
    <main className="mx-auto max-w-3xl p-4">
      <SharedPlay />
    </main>
  );
}
