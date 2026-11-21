import { Suspense } from "react";
import LoginError from "@/components/LoginError";

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-xl font-bold">作者ログイン</h1>
      <Suspense>
        <LoginError />
      </Suspense>
      <form method="post" action="/api/author/login" className="flex flex-col gap-3">
        <input type="password" name="password" required autoComplete="current-password" className="rounded border p-2" aria-label="パスワード" />
        <button className="rounded bg-gray-800 p-2 text-white">ログイン</button>
      </form>
    </main>
  );
}
