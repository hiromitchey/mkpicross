import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// 接続は1プロセス1つ（開発時のホットリロードで増えないよう globalThis に保持）
const g = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client = g.pg ?? postgres(process.env.DATABASE_URL!, { max: Number(process.env.DB_POOL_MAX ?? 10) });
if (process.env.NODE_ENV !== "production") g.pg = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
