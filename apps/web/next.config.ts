import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Docker 用（.next/standalone に実行一式）
  outputFileTracingRoot: path.join(__dirname, "../../"), // モノレポのルートから依存を拾う
  cacheComponents: true,
  partialPrefetching: true,
  // packages/core の TypeScript をそのままビルドに含める
  transpilePackages: ["@picross/core"],
  // 基本のセキュリティヘッダー（他サイトへの埋め込み禁止、MIME の推測禁止、参照元の送信を最小限に）
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
