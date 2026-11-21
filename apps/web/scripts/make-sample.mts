// サンプル問題（ハート）と表示用画像を書き出す: pnpm dlx tsx scripts/make-sample.mts
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { BLACK, WHITE, computeClues, encodeBits, estimateDifficulty, isPublishable, solve } from "@picross/core";

const ascii = [
  ".##...##..",
  "####.####.",
  "#########.",
  "#########.",
  ".#######..",
  "..#####...",
  "...###....",
  "....#.....",
  "..........",
  "..........",
];
const width = 10, height = 10;
const cells = new Uint8Array(width * height);
ascii.forEach((r, y) => [...r].forEach((ch, x) => (cells[y * width + x] = ch === "#" ? BLACK : WHITE)));
const solution = { width, height, cells };
const clues = computeClues(solution);
const result = solve(clues);
if (!isPublishable(result)) throw new Error(`公開不可: ${result.status} level ${result.level}`);

await writeFile("data/puzzles/heart.json", JSON.stringify({
  id: "heart", title: "ハート", version: 1, width, height, clues, givens: [],
  difficulty: estimateDifficulty(result, width, height), solution: encodeBits(solution), image: "heart.webp",
}, null, 2));

// 表示用イラスト（実運用では作者の元画像を sharp で再エンコードしたもの）
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><radialGradient id="g" cx="40%" cy="35%"><stop offset="0" stop-color="#ff9db5"/><stop offset="1" stop-color="#d6225a"/></radialGradient></defs><rect width="800" height="800" fill="#fff4e6"/><path d="M400 680 C120 480 60 300 180 190 C280 100 380 160 400 240 C420 160 520 100 620 190 C740 300 680 480 400 680Z" fill="url(#g)" transform="translate(-40 -40)"/></svg>`;
await sharp(Buffer.from(svg)).webp({ quality: 85 }).toFile("public/mvp-images/heart.webp");
console.log("ok", result.status, `level ${result.level}`);
