import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeUtm7 } from "../src/lib/utm7-auth.mjs";

const id = "de5f395b-64eb-45e5-9ec7-1d23aa7bc712";
const session = { statusCode: 200, body: { id } };
const admin = { user_id: id, active: true, is_admin: true };
const response = (body, statusCode = 200) => ({ statusCode, body });

test("accepts the active admin from the authoritative profile, regardless of legacy IDs", () => {
  assert.deepEqual(authorizeUtm7(session, response([admin]), { action: "dashboard" }), {
    user_id: id,
    authorized: true,
    payload: { action: "dashboard" },
  });
});

test("supports raw session data while requiring a unique profile array", () => {
  assert.equal(authorizeUtm7({ id }, [admin]).authorized, true);
  for (const profile of [admin, [], [admin, admin], null, { error: "denied" }]) {
    assert.equal(authorizeUtm7(session, response(profile)).authorized, false);
  }
});

test("requires both active and administrator booleans", () => {
  for (const profile of [
    { ...admin, active: false },
    { ...admin, is_admin: false },
    { ...admin, active: "true" },
    { ...admin, is_admin: 1 },
  ])
    assert.equal(authorizeUtm7(session, response([profile])).authorized, false);
});

test("denies a profile from the old database or another user", () => {
  const legacy = { ...admin, user_id: "346232d0-8180-432a-a811-8ce17199f841" };
  assert.equal(authorizeUtm7(session, response([legacy])).authorized, false);
});

test("invalid, expired, malformed and failed sessions cannot borrow an admin profile", () => {
  for (const auth of [
    null,
    {},
    { id: "invalid" },
    response({ id }, 401),
    response({ id, error: "expired" }),
    response({ error: "expired" }),
    { error: "network" },
  ]) {
    const result = authorizeUtm7(auth, response([admin]));
    assert.equal(result.authorized, false);
    assert.equal(result.user_id, "");
  }
});

test("a failed profile lookup cannot grant access even if its body looks valid", () => {
  for (const status of [401, 403, 500]) {
    assert.equal(authorizeUtm7(session, response([admin], status)).authorized, false);
  }
});

test("browser-supplied identity or admin flags never override server decisions", () => {
  const payload = { user_id: id, authorized: true, is_admin: true, active: true };
  assert.equal(authorizeUtm7({}, response([admin]), payload).authorized, false);
  const result = authorizeUtm7(session, response([{ ...admin, is_admin: false }]), payload);
  assert.equal(result.authorized, false);
  assert.equal(result.user_id, id);
});
