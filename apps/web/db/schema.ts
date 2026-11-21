import type { Clue, GivenCell } from "@picross/core";
import { sql } from "drizzle-orm";
import { integer, jsonb, pgEnum, pgTable, primaryKey, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const puzzleStatus = pgEnum("puzzle_status", ["draft", "published", "hidden"]);
export const userRole = pgEnum("user_role", ["admin", "author"]);
export const reportStatus = pgEnum("report_status", ["open", "resolved", "rejected"]);

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  displayName: text().notNull(),
  email: text().unique(),
  role: userRole().notNull().default("author"),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const puzzles = pgTable("puzzles", {
  id: uuid().primaryKey().defaultRandom(),
  authorId: uuid().notNull().references(() => users.id),
  title: text().notNull(),
  description: text().notNull().default(""),
  status: puzzleStatus().notNull().default("draft"),
  currentVersion: integer().notNull().default(1),
  tags: text().array().notNull().default(sql`'{}'::text[]`),
  playCount: integer().notNull().default(0),
  clearCount: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp({ withTimezone: true }),
});

export const puzzleVersions = pgTable(
  "puzzle_versions",
  {
    puzzleId: uuid().notNull().references(() => puzzles.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    solution: text().notNull(), // 行優先ビット列のbase64。プレイヤーには送らない
    rowClues: jsonb().$type<Clue[]>().notNull(),
    colClues: jsonb().$type<Clue[]>().notNull(),
    givenCells: jsonb().$type<GivenCell[]>().notNull().default([]),
    difficulty: integer().notNull(),
    blackRatio: real().notNull(),
    solverResult: jsonb().$type<{ status: string; level: number; probes: number; lineSteps: number }>().notNull(),
    convertParams: jsonb().$type<Record<string, unknown>>().notNull(),
    imageKey: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.puzzleId, t.version] })],
);

export const reports = pgTable("reports", {
  id: uuid().primaryKey().defaultRandom(),
  puzzleId: uuid().notNull().references(() => puzzles.id, { onDelete: "cascade" }),
  reason: text().notNull(),
  detail: text().notNull().default(""),
  status: reportStatus().notNull().default("open"),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
