import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyStatus } from "../src/lib/utm7-status.mjs";
import { bulkBudgetTargets, runBulkOperations } from "../src/lib/utm7-bulk.mjs";
import { funnelGeometry } from "../src/lib/utm7-view.mjs";

const request = {
  confirmed: true,
  level: "ad",
  entity_id: "120255051581720580",
  desired_status: "PAUSED",
  expected_status: "ACTIVE",
};
const connection = { account_id: "233896209622152" };
const live = {
  id: request.entity_id,
  account_id: connection.account_id,
  status: "ACTIVE",
  effective_status: "ACTIVE",
  campaign: { status: "ACTIVE" },
  adset: { status: "ACTIVE" },
};
test("status writes require explicit valid confirmation and same live entity/account", () => {
  assert.equal(verifyStatus(live, request, connection).ok, true);
  for (const change of [
    { confirmed: false },
    { confirmed: "true" },
    { desired_status: "DELETED" },
    { level: "other" },
    { entity_id: "bad" },
  ])
    assert.equal(verifyStatus(live, { ...request, ...change }, connection).ok, false);
  assert.equal(verifyStatus({ ...live, id: "other" }, request, connection).status, 403);
  assert.equal(verifyStatus({ ...live, account_id: "other" }, request, connection).status, 403);
});
test("status conflicts, archived items and failed reads never authorize a POST", () => {
  assert.equal(
    verifyStatus({ ...live, effective_status: "PAUSED" }, request, connection).ok,
    false,
  );
  assert.equal(verifyStatus({ ...live, status: "ARCHIVED" }, request, connection).ok, false);
  assert.equal(verifyStatus({ error: { message: "network" } }, request, connection).status, 502);
  assert.equal(verifyStatus(null, request, connection).status, 502);
});
test("activation cannot silently reactivate paused parents", () => {
  const activate = { ...request, desired_status: "ACTIVE" };
  assert.equal(
    verifyStatus({ ...live, campaign: { status: "PAUSED" } }, activate, connection).ok,
    false,
  );
  assert.equal(
    verifyStatus({ ...live, adset: { status: "PAUSED" } }, activate, connection).ok,
    false,
  );
  assert.equal(verifyStatus({ ...live, adset: undefined }, activate, connection).ok, false);
  assert.equal(
    verifyStatus(
      { ...live, campaign: undefined, adset: undefined },
      { ...activate, level: "campaign" },
      connection,
    ).ok,
    true,
  );
});
test("ads sharing a parent produce only one budget mutation per adset", () => {
  const adsets = [{ id: "123456789", name: "Parent", budgetMinor: 1000 }];
  const ads = [
    { id: "111111111", adset_id: "123456789" },
    { id: "222222222", adset_id: "123456789" },
  ];
  assert.equal(bulkBudgetTargets(ads, "ad", adsets).length, 1);
  assert.throws(() => bulkBudgetTargets(ads, "ad", []));
  assert.throws(() => bulkBudgetTargets(ads, "campaign", adsets));
  assert.throws(() => bulkBudgetTargets([{ id: "unattributed" }], "adset", []));
});
test("bulk writes are sequential, isolate errors and deduplicate IDs without automatic retries", async () => {
  const rows = [
    { id: "1", name: "One" },
    { id: "2", name: "Two" },
    { id: "1", name: "One" },
  ];
  let pending = 0,
    maximum = 0;
  const calls = [];
  const results = await runBulkOperations(rows, async (r) => {
    pending++;
    maximum = Math.max(maximum, pending);
    calls.push(r.id);
    await new Promise((r) => setTimeout(r, 1));
    pending--;
    if (r.id === "2") throw Error("Denied");
  });
  assert.equal(maximum, 1);
  assert.deepEqual(calls, ["1", "2"]);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.equal(results[1].error, "Denied");
  await assert.rejects(runBulkOperations([], () => {}));
  await assert.rejects(
    runBulkOperations(
      Array.from({ length: 51 }, (_, id) => ({ id: String(id) })),
      () => {},
    ),
  );
});
test("horizontal funnel rates use the first stage and never manufacture a missing denominator", () => {
  const graph = funnelGeometry([27, 21, 16, 2, 1]);
  assert.equal(graph.percentages[0], 100);
  assert(Math.abs(graph.percentages[4] - 100 / 27) < 1e-10);
  assert(graph.path.includes("C"));
  assert(!/NaN|Infinity/.test(graph.path));
  assert.deepEqual(funnelGeometry([0, 0, 0, 0]).percentages, [null, null, null, null]);
  assert.equal(funnelGeometry([10, 20, 1]).percentages[1], 200);
  assert(funnelGeometry([10, 20, 1]).heights[1] > funnelGeometry([10, 20, 1]).heights[0]);
});
