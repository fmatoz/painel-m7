import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const crm = read("src/routes/crm.tsx");
const sql = read("n8n/crm-api.sql");
const migration = read("supabase/migrations/20261001120000_add_crm_frozen_stage.sql");
const stages = [...crm.matchAll(/\{ id: "([^"]+)", label: "([^"]+)", color: "([^"]+)" \}/g)];
const expected = ["novo", "primeiro_contato", "respondeu", "follow_up", "reuniao", "proposta", "cliente", "congelado", "perdido", "fora_do_perfil"];

test("Congelado follows Cliente and preserves every existing stage", () => {
  assert.deepEqual(stages.map((match) => match[1]), expected);
  assert.equal(stages[7][2], "Congelado");
  assert.equal(stages[7][3], "bg-slate-400");
  assert.match(crm, /column.stage === "congelado"/);
  assert.match(crm, /stages\.map\(/);
});

test("API whitelist and database constraint accept the same stages as the UI", () => {
  for (const source of [sql.match(/IN \(('novo'[^)]+)\)/)[1], migration.match(/stage IN \(([^)]+)\)/)[1]]) {
    assert.deepEqual([...source.matchAll(/'([^']+)'/g)].map((match) => match[1]), expected);
  }
});

test("migration changes validation only, not existing records or permissions", () => {
  assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE|INSERT|TRUNCATE|GRANT|REVOKE)\b/i);
  assert.match(sql, /WHERE \(SELECT allowed FROM access_check\)/);
});
