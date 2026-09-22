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
};
const source = readFileSync(new URL("../n8n/sales-api.workflow.js", import.meta.url), "utf8")
  .replace(/^import[^\n]+\n/, "")
  .replace("export default", "globalThis.result =");
vm.runInNewContext(source, {
  node: (config) => {
    nodes.push(config);
    return config;
  },
  trigger: (config) => {
    nodes.push(config);
    return config;
  },
  expr: (value) => "=" + value,
  workflow: () => chain,
});
const normalizeCode = nodes.find((n) => n.config.name === "Normalizar pedido").config.parameters
  .jsCode;
const authorizeCode = nodes.find((n) => n.config.name === "Autorizar vendas e comissão").config
  .parameters.jsCode;
const normalize = (body) =>
  new Function("$input", normalizeCode)({ first: () => ({ json: { body } }) })[0].json;
const authorize = (body, auth, profile) => {
  const data = {
    "Normalizar pedido": normalize(body),
    "Validar sessão no Supabase": auth,
  };
  return new Function("$input", "$", authorizeCode)(
    { first: () => ({ json: profile }) },
    (name) => ({ first: () => ({ json: data[name] }) }),
  )[0].json;
};
const sdrId = "00000000-0000-4000-8000-000000000002";
const validAuth = { statusCode: 200, body: { id: sdrId, email: "sdr@example.test" } };
const sdrAccess = {
  statusCode: 200,
  body: [
    {
      user_id: sdrId,
      active: true,
      can_crm: true,
      can_inicio: true,
      is_admin: false,
      full_name: "SDR real",
    },
  ],
};

test("browser cannot forge identity or permissions", () => {
  const r = authorize(
    {
      action: "sale-create",
      token: "test",
      userId: "attacker",
      userName: "Administrator",
      isAdmin: true,
      active: true,
      changes: { seller_id: "attacker" },
    },
    validAuth,
    sdrAccess,
  );
  assert.equal(r.userId, sdrId);
  assert.equal(r.userName, "SDR real");
  assert.equal(r.isAdmin, false);
  assert.equal(r.canCrm, true);
  assert.equal("token" in r, false);
});
test("invalid or expired session fails closed even with forged permissions", () => {
  const r = authorize(
    { action: "sales-list", sessionValid: true, isAdmin: true },
    { statusCode: 401, body: { message: "expired" } },
    sdrAccess,
  );
  assert.equal(r.sessionValid, false);
  assert.equal(r.active, false);
  assert.equal(r.isAdmin, false);
});
test("missing profile still produces a denied response", () => {
  const r = authorize({ action: "sales-list" }, validAuth, { statusCode: 200, body: [] });
  assert.equal(r.active, false);
  assert.equal(r.canCrm, false);
});
test("profile belonging to another identity cannot grant access", () => {
  const r = authorize({}, validAuth, {
    statusCode: 200,
    body: [{ user_id: "other", active: true, is_admin: true, can_crm: true }],
  });
  assert.equal(r.active, false);
  assert.equal(r.isAdmin, false);
});
test("inactive profile and access request errors fail closed", () => {
  assert.equal(authorize({}, validAuth, { statusCode: 500, body: sdrAccess.body }).active, false);
  assert.equal(
    authorize({}, validAuth, { statusCode: 200, body: [{ ...sdrAccess.body[0], active: false }] })
      .active,
    false,
  );
});
test("text/plain JSON is normalized and malformed input is harmless", () => {
  assert.equal(normalize('{"token":"test","action":"settings-get"}').action, "settings-get");
  for (const input of ["broken", "null", "[]", null, []]) {
    assert.equal(normalize(input).token, "");
  }
});
test("Home-only users can receive settings without gaining CRM permission", () => {
  const r = authorize({}, validAuth, {
    statusCode: 200,
    body: [{ ...sdrAccess.body[0], can_crm: false }],
  });
  assert.equal(r.canInicio, true);
  assert.equal(r.canCrm, false);
});
