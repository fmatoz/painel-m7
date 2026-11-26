import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyBudget } from "../src/lib/utm7-budget.mjs";
const live = {
  id: "123456789",
  account_id: "987654321",
  daily_budget: "1000",
  campaign: { id: "555555555" },
};
const request = {
  adset_id: "123456789",
  expected_budget_minor: 1000,
  new_budget_minor: 1500,
  confirmed: true,
};
const conn = { account_id: "987654321" };
test("only an explicitly confirmed daily ABO budget may be applied", () =>
  assert.equal(verifyBudget(live, request, conn).ok, true));
test("missing confirmation never permits a write", () =>
  assert.equal(verifyBudget(live, { ...request, confirmed: false }, conn).ok, false));
test("amount is an integer in cents with a bounded range", () => {
  for (const amount of [0, -1, 10.5, NaN, 1000001])
    assert.equal(verifyBudget(live, { ...request, new_budget_minor: amount }, conn).ok, false);
});
test("live account and adset identities are checked before POST", () => {
  assert.equal(verifyBudget({ ...live, account_id: "999999999" }, request, conn).status, 403);
  assert.equal(verifyBudget({ ...live, id: "999999999" }, request, conn).status, 403);
});
test("stale cached budget requires a fresh confirmation", () =>
  assert.equal(verifyBudget({ ...live, daily_budget: "1200" }, request, conn).status, 409));
test("lifetime and campaign budgets are never converted to daily ABO", () => {
  for (const change of [
    { daily_budget: "0", lifetime_budget: "10000" },
    { campaign: { daily_budget: "5000" } },
    { campaign: { lifetime_budget: "50000" } },
  ])
    assert.equal(verifyBudget({ ...live, ...change }, request, conn).ok, false);
});
test("read errors never fall through into a budget write", () =>
  assert.equal(
    verifyBudget({ error: { message: "Permission denied" } }, request, conn).status,
    502,
  ));
