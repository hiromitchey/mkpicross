"use client";

import { useCallback, useEffect, useRef } from "react";
import type { SolveRequest } from "@/workers/solve.worker";

let seq = 0;

// Worker に1件投げて結果を Promise で受け取る。時間切れなら Worker ごと作り直す
export function useSolverWorker() {
  const ref = useRef<Worker | null>(null);
  useEffect(() => () => ref.current?.terminate(), []);

  return useCallback(<T,>(req: Omit<SolveRequest, "id">, timeoutMs = 20000) => {
    return new Promise<T>((resolve, reject) => {
      if (!ref.current) {
        ref.current = new Worker(new URL("../workers/solve.worker.ts", import.meta.url), { type: "module" });
      }
      const w = ref.current;
      const id = ++seq;
      const timer = setTimeout(() => {
        w.terminate();
        ref.current = null;
        reject(new Error("timeout"));
      }, timeoutMs);
      const onMessage = (e: MessageEvent<{ id: number }>) => {
        if (e.data.id !== id) return;
        clearTimeout(timer);
        w.removeEventListener("message", onMessage);
        resolve(e.data as T);
      };
      w.addEventListener("message", onMessage);
      w.postMessage({ ...req, id });
    });
  }, []);
}
