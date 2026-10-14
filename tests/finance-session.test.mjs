import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
const nodes = [];
const chain = {
  add() {
    return this;
  },
  to() {
    return this;
  },
  onTrue() {
    return this;
  },
  onFalse() {
    return this;
  },
};
const capture = (n) => {
  nodes.push(n);
  return Object.create(chain);
};
const source = readFileSync(
  new URL("../n8n/finance-delete-session.workflow.js", import.meta.url),
  "utf8",
)
  .replace(/^import[^\n]+\n/, "")
  .replace("export default", "globalThis.result =");
vm.runInNewContext(source, {
  node: capture,
  trigger: capture,
  ifElse: capture,
  expr: (v) => "=" + v,
  workflow: () => chain,
});
const params = (name) => nodes.find((n) => n.config.name === name).config.parameters;
const normalize = (body) =>
  new Function("$input", params("Normalizar exclusão").jsCode)({
    first: () => ({ json: { body } }),
  })[0].json;
const run = (
  body,
  auth = { statusCode: 200, body: { id: "user" } },
  profile = { statusCode: 200, body: [{ user_id: "user", active: true, can_financeiro: true }] },
) =>
  new Function("$input", "$", params("Validar autorização e ID").jsCode)(
    { first: () => ({ json: profile }) },
    (name) => ({
      first: () => ({ json: name === "Normalizar exclusão" ? normalize(body) : auth }),
    }),
  )[0].json;
test("finance deletion requires verified session and exact authorized profile", () => {
  assert.equal(run({ id: "id", isAdmin: true }, { statusCode: 401 }).statusCode, 401);
  for (const profile of [
    { user_id: "other", active: true, can_financeiro: true },
    { user_id: "user", active: false, can_financeiro: true },
    { user_id: "user", active: true, can_financeiro: false },
  ]) {
    assert.equal(
      run({ id: "id", can_financeiro: true }, undefined, { statusCode: 200, body: [profile] })
        .statusCode,
      403,
    );
  }
  assert.equal(run({ id: "id" }, undefined, { statusCode: 500, body: [] }).allowed, false);
  assert.equal(run({ id: "id" }).allowed, true);
});
test("finance session endpoint ignores forged row and permissions", () => {
  const result = run(JSON.stringify({ id: "test", token: "test", rowNumber: 1, allowed: true }));
  assert.equal(result.id, "test");
  assert.equal(result.rowNumber, undefined);
  assert.equal(result.token, undefined);
  for (const id of [null, [], {}, "", "x".repeat(251), "x\ny"])
    assert.equal(run({ id }).statusCode, 400);
  for (const body of ["broken", "null", "[]", null]) assert.equal(run(body).statusCode, 400);
});
test("finance session endpoint retains exact ID and single row protection", () => {
  const select = (rows) =>
    new Function("$input", "$", params("Localizar linha exata").jsCode)(
      { all: () => rows.map((json) => ({ json })) },
      () => ({ first: () => ({ json: { id: "test" } }) }),
    )[0].json;
  assert.equal(select([{ id: "test", row_number: 4 }]).rowNumber, 4);
  for (const rows of [
    [{}],
    [{ id: "test", row_number: 1 }],
    [
      { id: "test", row_number: 2 },
      { id: "test", row_number: 3 },
    ],
    [{ error: "failure" }],
  ])
    assert.equal(select(rows).allowed, false);
  const clear = params("Limpar somente lançamento selecionado");
  assert.equal(clear.operation, "clear");
  assert.equal(clear.rowsToDelete, 1);
  assert.equal(clear.startIndex, "={{ $json.rowNumber }}");
});
