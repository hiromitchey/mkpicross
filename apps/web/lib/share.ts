import { computeClues, encodeBits, type Clues, type GivenCell, type Grid } from "@picross/core";

/**
 * URL で送るピクロス
 *
 * - 問題は「共有コード」（下の Wire を圧縮して base64url にしたもの）で表す
 * - 共有コードはサーバーに預け（lib/shareStore.ts）、URL は /p#<8文字の ID> にする。
 *   コードを直接 /p#<コード> に入れても開ける（長いので普段は使わない）
 * - コードに入れるのはヒント・初期開示マス・題名と、暗号化した元の絵だけ。答えのドット絵は入れない
 * - 元の絵は「答えの盤面」から作った鍵で AES-GCM 暗号化する。解けた盤面がそのまま鍵になる
 *   （答えが1つに決まる問題だけ共有するので、ヒントを満たした盤面 = 答え）
 * - ヒントから解けば答えは分かるので、ソルバーを使えば解かずに絵を開けられる。友だち同士で遊ぶ用の目隠し
 */

export interface SharedPuzzle {
  width: number;
  height: number;
  clues: Clues;
  givens: GivenCell[];
  title: string;
  sealed: Sealed | null; // 暗号化した元の絵（つけないこともできる）
}

interface Sealed {
  salt: string; // base64url
  iv: string;
  data: string; // 暗号文（中身は WebP / JPEG / PNG の画像ファイル）
  type: string; // 画像の MIME タイプ
}

// URL に入れる形（キーは短く）
interface Wire {
  v: 1;
  w: number;
  h: number;
  r: number[][];
  c: number[][];
  g: [number, number, 1 | 2][];
  t: string;
  e?: { s: string; i: string; d: string; m: string };
}

// --- base64url ---
function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- 圧縮（ヒントの JSON はよく縮む。画像はもともと圧縮済みなのでほぼ変わらない）---
async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// --- 暗号化 ---
// 鍵 = SHA-256(salt + 答えの盤面のビット列)
async function keyFor(board: Grid, salt: Uint8Array<ArrayBuffer>, usage: KeyUsage): Promise<CryptoKey> {
  const bits = new TextEncoder().encode(`picross-share:v1:${encodeBits(board)}`);
  const material = new Uint8Array(salt.length + bits.length);
  material.set(salt);
  material.set(bits, salt.length);
  const hash = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, [usage]);
}

async function seal(image: Blob, answer: Grid): Promise<Sealed> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(answer, salt, "encrypt");
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await image.arrayBuffer());
  return { salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(data)), type: image.type };
}

/** 解けた盤面で元の絵を開ける。鍵が違えば（= 答えと違う盤面なら）null */
export async function openSealed(sealed: Sealed, board: Grid): Promise<Blob | null> {
  try {
    const key = await keyFor(board, fromB64(sealed.salt), "decrypt");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(sealed.iv) }, key, fromB64(sealed.data));
    return new Blob([plain], { type: sealed.type });
  } catch {
    return null;
  }
}

/** 共有用のコード（URL の # 以降）を作る。answer は答えが1つに決まることを確認済みの盤面 */
export async function makeShareCode(answer: Grid, givens: GivenCell[], title: string, image: Blob | null): Promise<string> {
  const clues = computeClues(answer);
  const wire: Wire = {
    v: 1,
    w: answer.width,
    h: answer.height,
    r: clues.rows,
    c: clues.cols,
    g: givens.map((g) => [g.x, g.y, g.state]),
    t: title,
  };
  if (image) {
    const s = await seal(image, answer);
    wire.e = { s: s.salt, i: s.iv, d: s.data, m: s.type };
  }
  const json = new TextEncoder().encode(JSON.stringify(wire));
  return toB64(await pipe(json, new CompressionStream("deflate-raw")));
}

/** 共有コードを読む。壊れていれば null */
export async function readShareCode(code: string): Promise<SharedPuzzle | null> {
  try {
    const json = await pipe(fromB64(code), new DecompressionStream("deflate-raw"));
    const w = JSON.parse(new TextDecoder().decode(json)) as Wire;
    const okSize = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 100;
    if (w.v !== 1 || !okSize(w.w) || !okSize(w.h) || w.r.length !== w.h || w.c.length !== w.w) return null;
    return {
      width: w.w,
      height: w.h,
      clues: { rows: w.r, cols: w.c },
      givens: w.g.filter(([x, y]) => x >= 0 && y >= 0 && x < w.w && y < w.h).map(([x, y, state]) => ({ x, y, state })),
      title: typeof w.t === "string" ? w.t.slice(0, 60) : "",
      sealed: w.e ? { salt: w.e.s, iv: w.e.i, data: w.e.d, type: w.e.m } : null,
    };
  } catch {
    return null;
  }
}

/** 途中保存のキー用（コードが同じなら同じ値） */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}
