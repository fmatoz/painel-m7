import test from "node:test";
import assert from "node:assert/strict";
import { requestState, tokenFromLink } from "../public/luana/control-client.js";

const token = "x".repeat(43);
const result = { ok: true, enabled: true, version: 3, updatedAt: "2026-10-21T15:00:00Z" };
test("private key comes from fragment, never from a public query string", () => {
  const values = new Map();
  const storage = { setItem: (k,v) => values.set(k,v), getItem: k => values.get(k) };
  assert.equal(tokenFromLink({ hash: "#chave=" + token }, storage), token);
  assert.equal(tokenFromLink({ hash: "" }, storage), token);
  assert.equal(tokenFromLink({ hash: "#chave=invalid" }, storage), null);
  assert.equal(tokenFromLink({ hash: "", search: "?chave=" + token }, { getItem: () => null }), null);
});
test("status requests are read only and omit cookies", async () => {
  const state = await requestState(token, undefined, { fetcher: async (_, init) => {
    assert.deepEqual(JSON.parse(init.body), { token, action: "status" });
    assert.equal(init.credentials, "omit");
    assert.equal(init.cache, "no-store");
    return Response.json(result);
  }});
  assert.deepEqual(state, { enabled: true, version: 3, updatedAt: result.updatedAt });
});
test("changes send explicit desired state and expected version", async () => {
  await requestState(token, { enabled: false, expectedVersion: 3 }, { fetcher: async (_, init) => {
    assert.deepEqual(JSON.parse(init.body), { token, action: "set", enabled: false, expectedVersion: 3 });
    return Response.json({ ...result, enabled: false, version: 4 });
  }});
});
test("invalid keys, stale state, network failures and malformed responses never confirm success", async () => {
  await assert.rejects(requestState(null), /link privado/);
  for (const status of [401, 409, 500]) {
    await assert.rejects(requestState(token, undefined, { fetcher: async () => Response.json({ ok: false }, { status }) }));
  }
  for (const payload of [{ ok: true }, { ...result, enabled: "true" }, { ...result, version: "3" }, { ...result, updatedAt: "invalid" }]) {
    await assert.rejects(requestState(token, undefined, { fetcher: async () => Response.json(payload) }));
  }
  await assert.rejects(requestState(token, undefined, { fetcher: async () => { throw new Error("offline"); } }), /offline/);
});
