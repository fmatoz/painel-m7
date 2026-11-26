import { pool } from "./db.mjs";
const keys = {
  offers: "id",
  connections: "id",
  reports: "connection_id,since,until",
  audit: "id",
  status_audit: "id",
};
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const snapshot = JSON.parse(raw);
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const counts = {};
  for (const [table, pk] of Object.entries(keys)) {
    const rows = snapshot[table];
    if (!Array.isArray(rows) || rows.length > 100000) throw Error("Invalid snapshot");
    const cols = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='utm7' AND table_name=$1 ORDER BY ordinal_position",
      [table],
    );
    const names = cols.rows.map((r) => r.column_name);
    const updates = names
      .filter((n) => !pk.split(",").includes(n))
      .map((n) => `${n}=EXCLUDED.${n}`)
      .join(",");
    await client.query(
      `INSERT INTO utm7.${table} SELECT * FROM jsonb_populate_recordset(NULL::utm7.${table},$1::jsonb) ON CONFLICT(${pk}) DO UPDATE SET ${updates}`,
      [JSON.stringify(rows)],
    );
    const r = await client.query(
      `SELECT count(*)::integer AS count,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY ${pk})::text,'[]')) AS fingerprint FROM utm7.${table} t`,
    );
    if (r.rows[0].count !== rows.length || r.rows[0].fingerprint !== snapshot.fingerprints[table])
      throw Error("Migration verification failed: " + table);
    counts[table] = r.rows[0].count;
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({ ok: true, counts, fingerprints_verified: true }));
} catch (e) {
  await client.query("ROLLBACK");
  console.error(e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

