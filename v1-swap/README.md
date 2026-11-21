# v1 切り替え用ファイル

MVP（JSONファイル）から v1（PostgreSQL＋署名付き画像URL）に切り替えるときに、下の場所へ上書きコピーする。
実PostgreSQL 18 で、作成 → 公開 → プレイ → クリア → 画像表示まで動作確認済み（2026-11-03）。

| このフォルダのファイル | コピー先 |
|---|---|
| play-page.tsx | apps/web/app/play/[id]/page.tsx |
| verify-route.ts | apps/web/app/api/puzzles/[id]/verify/route.ts |
| reveal-route.ts | apps/web/app/api/puzzles/[id]/reveal/route.ts（新規） |
| opengraph-image.tsx | apps/web/app/play/[id]/opengraph-image.tsx |

```bash
cp v1-swap/play-page.tsx          "apps/web/app/play/[id]/page.tsx"
cp v1-swap/verify-route.ts        "apps/web/app/api/puzzles/[id]/verify/route.ts"
mkdir -p "apps/web/app/api/puzzles/[id]/reveal"
cp v1-swap/reveal-route.ts        "apps/web/app/api/puzzles/[id]/reveal/route.ts"
cp v1-swap/opengraph-image.tsx    "apps/web/app/play/[id]/opengraph-image.tsx"
```
