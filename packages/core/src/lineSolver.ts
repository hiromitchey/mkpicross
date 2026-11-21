import { BLACK, UNKNOWN, WHITE, type Clue } from "./types";

/**
 * ライン解法: 1列の確定済みマスとヒントから、全配置の共通部分を求める。
 * 戻り値: 新しい列（確定が増えたもの）。矛盾していれば null。
 *
 * F[p][j] = 先頭から p マス目の直前までに j 個のブロックを置き終え、p からブロックを置き始められる
 * B[p][j] = p マス目以降に j 番目以降のブロックをすべて置ける
 */
export function solveLine(line: Uint8Array, clue: Clue): Uint8Array | null {
  const n = line.length;
  const k = clue.length;
  const W = k + 1;

  // 区間 [a, b) に既知の白・黒があるかを O(1) で調べる累積和
  const whiteSum = new Int32Array(n + 1);
  const blackSum = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    whiteSum[i + 1] = whiteSum[i] + (line[i] === WHITE ? 1 : 0);
    blackSum[i + 1] = blackSum[i] + (line[i] === BLACK ? 1 : 0);
  }
  const noWhite = (a: number, b: number) => whiteSum[b] - whiteSum[a] === 0;
  const noBlack = (a: number, b: number) => blackSum[b] - blackSum[a] === 0;

  // 位置 s にブロック j を置けるか（後ろの区切りマスも含めて）
  const canPlace = (s: number, j: number) => {
    const e = s + clue[j];
    if (e > n || !noWhite(s, e)) return false;
    return e === n || line[e] !== BLACK;
  };
  const next = (s: number, j: number) => Math.min(s + clue[j] + 1, n);

  // 後ろから: B
  const B = new Uint8Array((n + 2) * W);
  for (let p = n; p >= 0; p--) {
    for (let j = k; j >= 0; j--) {
      let ok = false;
      if (j === k) ok = noBlack(p, n);
      else if (p < n) {
        if (line[p] !== BLACK && B[(p + 1) * W + j]) ok = true;
        else if (canPlace(p, j) && B[next(p, j) * W + j + 1]) ok = true;
      }
      B[p * W + j] = ok ? 1 : 0;
    }
  }
  if (!B[0]) return null; // 矛盾

  // 前から: F（B と両立する遷移だけたどる）
  const F = new Uint8Array((n + 2) * W);
  F[0] = 1;
  const canBlack = new Uint8Array(n);
  const canWhite = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    for (let j = 0; j <= k; j++) {
      if (!F[p * W + j]) continue;
      // p を白にする
      if (line[p] !== BLACK && B[(p + 1) * W + j]) {
        canWhite[p] = 1;
        F[(p + 1) * W + j] = 1;
      }
      // p からブロック j を置く
      if (j < k && canPlace(p, j) && B[next(p, j) * W + j + 1]) {
        const e = p + clue[j];
        for (let i = p; i < e; i++) canBlack[i] = 1;
        if (e < n) canWhite[e] = 1;
        F[next(p, j) * W + j + 1] = 1;
      }
    }
  }

  const out = new Uint8Array(line);
  for (let i = 0; i < n; i++) {
    if (out[i] !== UNKNOWN) continue;
    if (canBlack[i] && !canWhite[i]) out[i] = BLACK;
    else if (canWhite[i] && !canBlack[i]) out[i] = WHITE;
  }
  return out;
}
