import { test } from "node:test";
import assert from "node:assert/strict";
import { utm7Proxy } from "../src/lib/utm7-proxy.server.mjs";
const origin = "https://example.com",
  token = "b".repeat(64),
  user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "qa@example.com",
    full_name: "QA",
    active: true,
    is_admin: true,
  };
const req = (route, p, headers = {}) =>
  new Request(origin + "/api/utm7/" + route, {
    method: p ? "POST" : "GET",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    ...(p ? { body: JSON.stringify(p) } : {}),
  });
const ok = (data) =>
  new Response(JSON.stringify({ ok: true, data }), {
    headers: { "Content-Type": "application/json" },
  });
test("login token only leaves the proxy as a secure HttpOnly strict cookie", async () => {
  const r = await utm7Proxy(
    req("auth", { action: "login", email: user.email, password: "secret" }),
    async () =>
      ok({
        user,
        token,
        password_hash: "must-not-leak",
        expires_at: new Date(Date.now() + 28800000).toISOString(),
      }),
  );
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie");
  for (const part of ["__Host-utm7_session=", "HttpOnly", "Secure", "SameSite=Strict", "Path=/"])
    assert.ok(cookie.includes(part));
  const data = await r.text();
  assert.ok(!data.includes(token));
  assert.ok(!data.includes("must-not-leak"));
});
test("data API identity is exclusively from the cookie, not supplied token or flags", async () => {
  let actual;
  const r = await utm7Proxy(
    req(
      "data",
      {
        action: "dashboard",
        token: "c".repeat(64),
        authorized: true,
        user_id: user.id,
        internal: { token: "bad" },
      },
      { cookie: "__Host-utm7_session=" + token },
    ),
    async (url, p) => {
      actual = JSON.parse(p.body);
      return ok({ value: 1, internal: { token: "sensitive" }, token: "sensitive" });
    },
  );
  assert.equal(actual.token, token);
  for (const k of ["authorized", "user_id", "internal"]) assert.equal(k in actual, false);
  assert.ok(!(await r.text()).includes("sensitive"));
});
test("missing or invalid cookie denies data before upstream access", async () => {
  for (const cookie of ["", "__Host-utm7_session=invalid", "__Host-utm7_session=" + token + "x"]) {
    let calls = 0;
    const r = await utm7Proxy(req("data", { action: "dashboard", token }, { cookie }), async () => {
      calls++;
      return ok({});
    });
    assert.equal(r.status, 401);
    assert.equal(calls, 0);
  }
});
test("cross-origin and missing-origin mutations are denied, including login and logout", async () => {
  for (const o of ["https://evil.example", "null", ""])
    assert.equal((await utm7Proxy(req("auth", { action: "logout" }, { origin: o }))).status, 403);
});
test("upstream expired session clears browser cookie and fails closed", async () => {
  const r = await utm7Proxy(
    req("session", null, { cookie: "__Host-utm7_session=" + token }),
    async () =>
      new Response(JSON.stringify({ ok: false, error: "expired", status: 401 }), { status: 401 }),
  );
  assert.equal(r.status, 401);
  assert.match(r.headers.get("set-cookie"), /Max-Age=0/);
});
test("logout revokes only current cookie session and clears it", async () => {
  let actual;
  const r = await utm7Proxy(
    req(
      "auth",
      { action: "logout", token: "c".repeat(64) },
      { cookie: "__Host-utm7_session=" + token },
    ),
    async (url, p) => {
      actual = JSON.parse(p.body);
      return ok({});
    },
  );
  assert.equal(actual.token, token);
  assert.match(r.headers.get("set-cookie"), /Max-Age=0/);
});
test("malformed replies, role failures and upstream errors fail closed", async () => {
  for (const transport of [
    async () => new Response("oops"),
    async () =>
      ok({ user: { ...user, is_admin: false }, token, expires_at: new Date().toISOString() }),
    async () => {
      throw Error("SECRET");
    },
    async () => new Response(JSON.stringify({ ok: false, error: "failure" }), { status: 500 }),
  ]) {
    const r = await utm7Proxy(req("auth", { action: "login" }), transport);
    assert.equal(r.status, 503);
    assert.ok(!(await r.text()).includes("SECRET"));
  }
});
test("unsupported operations, oversized requests and method changes never reach upstream", async () => {
  assert.equal((await utm7Proxy(req("data", { action: "arbitrary_sql" }))).status, 400);
  assert.equal(
    (await utm7Proxy(req("auth", { action: "login", password: "x".repeat(65537) }))).status,
    413,
  );
  assert.equal((await utm7Proxy(req("data"))).status, 405);
  assert.equal((await utm7Proxy(req("arbitrary"))).status, 404);
});

