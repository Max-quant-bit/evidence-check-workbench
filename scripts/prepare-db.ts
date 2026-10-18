import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const databasePath = process.env.DATABASE_URL ?? ".data/evidence.db";
fs.mkdirSync(path.dirname(path.resolve(databasePath)), {
  recursive: true,
  mode: 0o700,
});
