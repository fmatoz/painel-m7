import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  checkPassword,
  newToken,
  digest,
  validToken,
  validPassword,
} from "../utm7-server/passwords.mjs";
import { authorizeOwnUtm7 } from "../src/lib/utm7-own-auth.mjs";
const id = "11111111-1111-4111-8111-111111111111";
test("own passwords use salted scrypt and verify only the correct password", async () => {
  const p = "correct horse 12345",
    h = await hashPassword(p);
  assert.match(h, /^scrypt\$/);
  assert.notEqual(await hashPassword(p), h);
  assert.equal(await checkPassword(p, h), true);
  assert.equal(await checkPassword("incorrect", h), false);
  assert.equal(await checkPassword(p, null), false);
  assert.equal(await checkPassword(p, "scrypt$999999999$8$1$a$b"), false);
});
test("own tokens are random, fixed-size and stored as hashes", () => {
  const a = newToken(),
    b = newToken();
  assert.equal(validToken(a), true);
  assert.notEqual(a, b);
  assert.notEqual(digest(a), a);
  assert.equal(validToken(a + "x"), false);
  assert.equal(validPassword("short"), false);
  assert.equal(validPassword("x".repeat(129)), false);
});
test("own session requires authoritative active admin and never trusts browser claims", () => {
  const body = { ok: true, data: { user: { id, active: true, is_admin: true } } };
  assert.equal(authorizeOwnUtm7({ statusCode: 200, body }).authorized, true);
  for (const response of [
    null,
    { statusCode: 401, body },
    { statusCode: 200, body: { ok: false, data: body.data } },
    { statusCode: 200, body: { ok: true, data: { user: { id, active: "true", is_admin: true } } } },
    { statusCode: 200, body: { ok: true, data: { user: { id, active: true, is_admin: false } } } },
  ])
    assert.equal(authorizeOwnUtm7(response, { user_id: id, authorized: true }).authorized, false);
});

