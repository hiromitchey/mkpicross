import { describe, expect, it } from "vitest";
import {
  BLACK,
  WHITE,
  blackRatio,
  computeClues,
  convertImage,
  decodeBits,
  DEFAULT_PARAMS,
  diffCells,
  encodeBits,
  estimateDifficulty,
  hasTransparency,
  isPublishable,
  isSolved,
  lineClue,
  otsuThreshold,
  solve,
  solveLine,
  suggestGivens,
  UNKNOWN,
  type Grid,
  type RGBAImage,
} from "../src";

// "#" = 黒, "." = 白 の文字列から盤面を作る
function fromAscii(rows: string[]): Grid {
  const height = rows.length;
  const width = rows[0].length;
  const cells = new Uint8Array(width * height);
  rows.forEach((r, y) => [...r].forEach((ch, x) => (cells[y * width + x] = ch === "#" ? BLACK : WHITE)));
  return { width, height, cells };
}

function randomGrid(w: number, h: number, density: number, seed: number): Grid {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const cells = new Uint8Array(w * h);
  for (let i = 0; i < cells.length; i++) cells[i] = rnd() < density ? BLACK : WHITE;
  return { width: w, height: h, cells };
}

const HEART = fromAscii([
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
]);

describe("ヒント生成", () => {
  it("黒の連続をヒントにする", () => {
    expect(lineClue([1, 1, 2, 1, 2, 2, 1, 1, 1])).toEqual([2, 1, 3]);
    expect(lineClue([2, 2, 2])).toEqual([]);
  });
  it("盤面から行・列ヒント", () => {
    const c = computeClues(fromAscii(["##.", "..#", "#.#"]));
    expect(c.rows).toEqual([[2], [1], [1, 1]]);
    expect(c.cols).toEqual([[1, 1], [1], [2]]);
  });
});

describe("ライン解法", () => {
  it("長さ10・ヒント[8] → 中央6マスが黒", () => {
    const r = solveLine(new Uint8Array(10), [8])!;
    expect([...r]).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 0, 0]);
  });
  it("ヒント[] → 全部白", () => {
    expect([...solveLine(new Uint8Array(4), [])!]).toEqual([2, 2, 2, 2]);
  });
  it("ぴったり埋まる [2,1] 長さ4", () => {
    expect([...solveLine(new Uint8Array(4), [2, 1])!]).toEqual([1, 1, 2, 1]);
  });
  it("既知マスとの矛盾を検出", () => {
    expect(solveLine(new Uint8Array([BLACK, BLACK, BLACK]), [1])).toBeNull();
  });
  it("既知の黒から範囲を絞る", () => {
    // 長さ6・ヒント[2]、3マス目が黒 → 1,4,5,6マス目以外は不明、離れたマスは白
    const line = new Uint8Array([UNKNOWN, UNKNOWN, BLACK, UNKNOWN, UNKNOWN, UNKNOWN]);
    expect([...solveLine(line, [2])!]).toEqual([2, 0, 1, 0, 2, 2]);
  });
});

describe("ソルバー", () => {
  it("2×2の対角は別解あり", () => {
    const r = solve(computeClues(fromAscii(["#.", ".#"])));
    expect(r.status).toBe("multiple");
    expect(r.solutions).toHaveLength(2);
  });
  it("ハートは一意・ライン解法のみ", () => {
    const r = solve(computeClues(HEART));
    expect(r.status).toBe("unique");
    expect(r.level).toBe(1);
    expect(diffCells(HEART, r.solutions[0])).toEqual([]);
  });
  it("矛盾したヒントは解なし", () => {
    const r = solve({ rows: [[2], []], cols: [[1], []] });
    expect(r.status).toBe("none");
  });
  it("別解でもヒント充足なら正解扱い", () => {
    const clues = computeClues(fromAscii(["#.", ".#"]));
    expect(isSolved(fromAscii([".#", "#."]), clues)).toBe(true);
    expect(isSolved(fromAscii(["##", ".."]), clues)).toBe(false);
  });
  it("ハートは公開可、2×2対角は公開不可", () => {
    expect(isPublishable(solve(computeClues(HEART)))).toBe(true);
    expect(isPublishable(solve(computeClues(fromAscii(["#.", ".#"]))))).toBe(false);
  });
  it("推測が必要な盤面は未確定マスを返す", () => {
    const r = solve(computeClues(fromAscii(["#.", ".#"])), { search: false });
    expect(r.status).toBe("unknown");
    expect(r.level).toBe(3);
    expect(r.unresolved).toBe(4);
  });
  it("30×30ランダムでも分岐探索は制限時間で打ち切る", () => {
    for (const d of [0.3, 0.55]) {
      for (let seed = 1; seed <= 3; seed++) {
        const r = solve(computeClues(randomGrid(30, 30, d, seed)), { timeoutMs: 1000 });
        expect(["unique", "multiple", "unknown"]).toContain(r.status);
        expect(r.ms).toBeLessThan(4000);
      }
    }
  });
});

describe("初期開示マスで一意化", () => {
  it("別解ありの問題を一意にできる", () => {
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const g = randomGrid(15, 15, 0.5, seed);
      if (solve(computeClues(g)).status !== "multiple") continue;
      found = true;
      const { givens, solvable, result } = suggestGivens(g);
      expect(solvable).toBe(true);
      expect(result.level).toBeLessThanOrEqual(2);
      expect(givens.length).toBeGreaterThan(0);
      expect(diffCells(g, result.solutions[0])).toEqual([]);
    }
    expect(found).toBe(true);
  });
});

describe("初期開示マス（疎な30×30）", () => {
  it("分岐探索なしで時間内に推測不要まで持っていける", () => {
    const g = randomGrid(30, 30, 0.3, 1);
    const t = Date.now();
    const { solvable, givens } = suggestGivens(g, { maxGivens: 900 });
    expect(solvable).toBe(true);
    expect(Date.now() - t).toBeLessThan(20000);
    console.log(`疎な30×30: 開示 ${givens.length} マス, ${Date.now() - t}ms`);
  }, 30000);
});

describe("エンコード", () => {
  it("30×30は152文字、往復で一致", () => {
    const g = randomGrid(30, 30, 0.5, 7);
    const b64 = encodeBits(g);
    expect(b64).toHaveLength(152);
    expect([...decodeBits(b64, 30, 30).cells]).toEqual([...g.cells]);
  });
  it("長さ不正は例外", () => {
    expect(() => decodeBits(encodeBits(HEART), 30, 30)).toThrow();
  });
});

describe("画像変換", () => {
  // 白背景に黒い円の 200×200 画像
  function circleImage(): RGBAImage {
    const w = 200;
    const h = 200;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const inside = (x - 100) ** 2 + (y - 100) ** 2 < 70 ** 2;
        const v = inside ? 40 : 230;
        data.set([v, v, v, 255], (y * w + x) * 4);
      }
    return { width: w, height: h, data };
  }

  it("大津法は2つの山の間", () => {
    const g = new Float32Array(1000);
    g.fill(40, 0, 500);
    g.fill(230, 500);
    const t = otsuThreshold(g);
    expect(t).toBeGreaterThanOrEqual(40);
    expect(t).toBeLessThan(230);
  });

  it("円の画像 → 15×15で中央が黒・四隅が白・一意解", () => {
    const { grid } = convertImage(circleImage(), DEFAULT_PARAMS);
    const at = (x: number, y: number) => grid.cells[y * 15 + x];
    expect(at(7, 7)).toBe(BLACK);
    expect(at(0, 0)).toBe(WHITE);
    expect(at(14, 14)).toBe(WHITE);
    const ratio = blackRatio(grid);
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.6);
    const r = solve(computeClues(grid));
    expect(r.status).toBe("unique");
    expect(estimateDifficulty(r, 15, 15)).toBeGreaterThanOrEqual(1);
  });

  it("透過部分は白として扱う", () => {
    const data = new Uint8ClampedArray(10 * 10 * 4); // 全面 RGBA=0（透明な黒）
    const { grid } = convertImage(
      { width: 10, height: 10, data },
      { ...DEFAULT_PARAMS, gridWidth: 5, gridHeight: 5, thresholdMode: "fixed" },
    );
    expect(blackRatio(grid)).toBe(0);
  });

  it("シルエット: 色に関係なく不透明な所が黒、透明な所が白", () => {
    // 左半分 = 不透明な白、右半分 = 透明
    const w = 20;
    const h = 20;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(x < 10 ? [255, 255, 255, 255] : [0, 0, 0, 0], (y * w + x) * 4);
    const img = { width: w, height: h, data };
    expect(hasTransparency(img)).toBe(true);
    const { grid } = convertImage(img, { ...DEFAULT_PARAMS, mode: "silhouette", gridWidth: 4, gridHeight: 4 });
    for (let y = 0; y < 4; y++) expect(Array.from(grid.cells.slice(y * 4, y * 4 + 4))).toEqual([BLACK, BLACK, WHITE, WHITE]);
  });
});
