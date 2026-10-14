import test from "node:test";
import assert from "node:assert/strict";
import { deleteFinancialEntry } from "../src/lib/finance-delete.ts";

test("finance client requires a session and confirmed matching ID", async (t) => {
  const calls = [];
  const fetchMock = t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ ok: true, id: "entry" }));
  });
  await assert.rejects(deleteFinancialEntry("", "entry"), /sessão expirou/);
  assert.equal(calls.length, 0);
  assert.equal((await deleteFinancialEntry("session", "entry")).id, "entry");
  assert.match(calls[0].url, /m7-finance\/delete-session$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { token: "session", id: "entry" });
  for (const data of [{ ok: true, id: "another" }, { ok: false }, null]) {
    fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify(data)));
    await assert.rejects(deleteFinancialEntry("session", "entry"), /não confirmou/);
  }
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ error: "Sem acesso" }), { status: 403 }));
  await assert.rejects(deleteFinancialEntry("session", "entry"), /Sem acesso/);
  fetchMock.mock.mockImplementation(async () => new Response("<html>down</html>", { status: 502 }));
  await assert.rejects(deleteFinancialEntry("session", "entry"), /não confirmou/);
});
