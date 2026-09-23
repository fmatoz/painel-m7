import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const nodes = [];
const chain = { add() { return this; }, to() { return this; }, onTrue() { return this; }, onFalse() { return this; } };
const capture = (config) => { nodes.push(config); return Object.create(chain); };
const source = readFileSync(new URL("../n8n/finance-delete.workflow.js", import.meta.url), "utf8")
  .replace(/^import[^\n]+\n/, "").replace("export default", "globalThis.result =");
vm.runInNewContext(source, { node: capture, trigger: capture, ifElse: capture, expr: v => "=" + v, workflow: () => chain });
const params = name => nodes.find(n => n.config.name === name).config.parameters;
const authCode = params("Validar autorização e ID").jsCode.replace('const expected = "__M7_SERVER_TOKEN__";', 'const expected = "test-secret";');
const authorize = (body, token = "test-secret") => new Function("$input", authCode)({first:()=>({json:{body,headers:{"x-m7-token":token}}})})[0].json;
const select = (rows, id = "test-id") => new Function("$input", "$", params("Localizar linha exata").jsCode)(
  {all:()=>rows.map(json=>({json}))}, () => ({first:()=>({json:{id}})})
)[0].json;

test("requires server authentication before accepting IDs", () => {
  assert.equal(authorize({id:"test-id"}, "wrong").statusCode, 401);
  assert.equal(authorize({id:"test-id"}).allowed, true);
});
test("rejects missing, malformed, oversized and control-character IDs", () => {
  for (const id of [undefined, null, [], {}, "", " ", "x".repeat(251), "x\ny"]) {
    assert.equal(authorize({id}).statusCode, 400);
  }
});
test("does not accept a client-provided row number", () => {
  const result = authorize({id:"test-id",rowNumber:1});
  assert.equal(result.rowNumber, undefined);
});
test("missing and duplicate IDs never authorize a write", () => {
  assert.equal(select([{}]).statusCode, 404);
  assert.equal(select([{id:"test-id",row_number:3},{id:"test-id",row_number:4}]).statusCode, 409);
  assert.equal(select([{id:"another",row_number:3}]).statusCode, 404);
});
test("protects header and invalid row indexes", () => {
  for (const row_number of [undefined,0,1,-1,2.5,"NaN"]) {
    assert.equal(select([{id:"test-id",row_number}]).allowed, false);
  }
});
test("uses only server-returned exact unique row", () => {
  const result = select([{id:"other",row_number:8},{id:"test-id",row_number:7}]);
  assert.equal(result.allowed, true);
  assert.equal(result.rowNumber, 7);
});
test("limits removal to one row without shifting other records", () => {
  const p = params("Limpar somente lançamento selecionado");
  assert.equal(p.operation, "clear");
  assert.equal(p.clear, "specificRows");
  assert.equal(p.rowsToDelete, 1);
  assert.equal(p.startIndex, "={{ $json.rowNumber }}");
});
test("reads through blank rows and rejects sheet read errors", () => {
  assert.equal(params("Buscar lançamento pelo ID").options.dataLocationOnSheet.values.range, "A:W");
  assert.equal(select([{error:"Sheets unavailable"}]).statusCode, 502);
});
test("write errors never become successful deletions", () => {
  const run = json => new Function("$input", "$", params("Confirmar resultado").jsCode)(
    {first:()=>({json})}, () => ({first:()=>({json:{id:"test-id"}})})
  )[0].json;
  assert.equal(run({error:"failure"}).ok, false);
  assert.equal(run({success:true}).id, "test-id");
});
