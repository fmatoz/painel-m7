import { readFileSync } from "node:fs";
import pg from "pg";
export const pool = new pg.Pool({
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: readFileSync(process.env.PGPASSWORD_FILE, "utf8").trim(),
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
  statement_timeout: 15000,
});

