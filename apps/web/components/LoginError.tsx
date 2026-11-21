"use client";

import { useSearchParams } from "next/navigation";

// ログイン失敗時（?error=1）のメッセージ
export default function LoginError() {
  const failed = useSearchParams().get("error") === "1";
  return failed ? (
    <p role="alert" className="mb-3 text-red-600">
      パスワードが違います
    </p>
  ) : null;
}
