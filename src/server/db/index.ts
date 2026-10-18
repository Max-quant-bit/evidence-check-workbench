import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export const databasePath = process.env.DATABASE_URL ?? ".data/evidence.db";
fs.mkdirSync(path.dirname(path.resolve(databasePath)), {
  recursive: true,
  mode: 0o700,
});

const sqlite = new Database(databasePath);
sqlite.pragma("foreign_keys = ON");
export const db = drizzle(sqlite, { schema });
