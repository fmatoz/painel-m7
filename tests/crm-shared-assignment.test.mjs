import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const source = ts.transpileModule(read("src/lib/crm-assignment.ts"), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { leadAssignees, isLeadAssignee, leadAssigneeNames } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const original = { assigned_to: "sdr", assigned_to_name: "Leila" };
const shared = { ...original, co_assignees: [{ id: "admin", name: "Felipe" }] };

test("shared lead belongs to both people, not a third user, and has both names", () => {
  assert.equal(isLeadAssignee(shared, "sdr"), true);
  assert.equal(isLeadAssignee(shared, "admin"), true);
  assert.equal(isLeadAssignee(shared, "other"), false);
  assert.equal(isLeadAssignee(shared, undefined), false);
  assert.equal(leadAssigneeNames(shared), "Leila + Felipe");
  assert.equal(leadAssignees(shared).length, 2);
});
test("old payloads, blank assignments and duplicate members are safe", () => {
  assert.equal(leadAssigneeNames(original), "Leila");
  assert.equal(leadAssigneeNames({}), "");
  assert.equal(leadAssigneeNames({ assigned_to_name: "Legado" }), "Legado");
  assert.equal(leadAssignees({ ...shared, co_assignees: [null, {}, { id: "sdr", name: "Duplicado" }] }).length, 1);
  assert.deepEqual(leadAssignees({ ...original, co_assignees: {} }), [{ id: "sdr", name: "Leila" }]);
});
test("CRM filters, cards, selected lead and home summary include collaborators", () => {
  const crm = read("src/routes/crm.tsx");
  assert.match(crm, /assignee === "mine" && isLeadAssignee\(lead, user\?\.id\)/);
  assert.match(crm, /leadAssignees\(lead\)\.some/);
  assert.match(crm, /JSON.stringify\(freshLead.co_assignees\)/);
  assert.match(crm, /Assumir junto/);
  assert.match(crm, /Compartilhar com Felipe/);
  assert.match(crm, /!isAdmin && isLeadAssignee\(lead, currentUserId\)/);
  assert.doesNotMatch(crm, /Transferir para mim/);
  assert.match(read("src/routes/inicio.tsx"), /isLeadAssignee\(lead, user\?\.id\)/);
});
test("database operation locks the lead and is not exposed as a public RPC", () => {
  const sql = read("supabase/migrations/20261021120000_add_crm_shared_assignment.sql");
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /last_touched_at=now\(\)/);
  assert.match(sql, /SELECT \* INTO recipient FROM m7_private.crm_share_recipient/);
  assert.doesNotMatch(sql, /p->>'targetUserId'/);
  assert.match(read("n8n/crm-api.sql"), /m7_private.assign_crm_lead/);
});
