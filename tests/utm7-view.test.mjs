import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  columnPreferences,
  moveColumn,
  filterMetricRows,
  summarizeMetricRows,
} from "../src/lib/utm7-view.mjs";

test("column order survives restore and accepts new metrics without invalid/duplicate keys", () => {
  assert.deepEqual(
    columnPreferences(
      { order: ["b", "b", "removed"], visible: ["c", "c", "invalid"] },
      ["a", "b", "c"],
      ["a"],
    ),
    { order: ["b", "a", "c"], visible: ["c"] },
  );
  assert.deepEqual(columnPreferences(null, ["a", "b"], ["a"]).visible, ["a"]);
});
test("moving columns works in both directions and ignores missing/same targets", () => {
  const order = ["a", "b", "c", "d"];
  assert.deepEqual(moveColumn(order, "a", "c"), ["b", "c", "a", "d"]);
  assert.deepEqual(moveColumn(order, "d", "b"), ["a", "d", "b", "c"]);
  assert.deepEqual(moveColumn(order, "z", "b"), order);
});
test("active filter excludes paused, inherited pauses, unknown and unattributed rows at every level", () => {
  for (const level of ["campaign", "adset", "ad"]) {
    const rows = ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", undefined].map(
      (status, i) => ({ id: String(i), name: "Criativo " + i, level, status }),
    );
    assert.equal(filterMetricRows(rows, "", false).length, 5);
    assert.deepEqual(
      filterMetricRows(rows, "CRIATIVO", true).map((r) => r.id),
      ["0"],
    );
    assert.deepEqual(filterMetricRows(rows, "1", true), []);
  }
});
test("filtered footer recomputes weighted rates and budget instead of using overall totals", () => {
  const rows = [
    { spend: 10, clicks: 2, impressions: 10, revenue: 20, purchases: 1, checkouts: 2, paymentAttempts: 1, budgetMinor: 1000 },
    { spend: 20, clicks: 8, impressions: 90, revenue: 40, purchases: 1, checkouts: 3, paymentAttempts: 1, budgetMinor: 1500 },
  ];
  const m = summarizeMetricRows(rows);
  assert.equal(m.spend, 30);
  assert.equal(m.cpc, 3);
  assert.equal(m.ctr, 10);
  assert.equal(m.cpa, 15);
  assert.equal(m.paymentAttempts, 2);
  assert.equal(m.costPaymentAttempt, 15);
  assert.equal(m.paymentAttemptRate, 40);
  assert.equal(m.budgetMinor, 2500);
  assert.equal(m.frequency, null);
  assert.equal(summarizeMetricRows([]).cpa, null);
});

test("M7 text and semantic colors keep AA contrast on dark and light surfaces", () => {
  const css = readFileSync(new URL("../src/utm7.css", import.meta.url), "utf8");
  const palettes = [...css.matchAll(/\{([^{}]*--u-bg:[^{}]*)\}/g)].slice(0, 2);
  const luminance = (hex) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  assert.equal(palettes.length, 2);
  for (const [, block] of palettes) {
    const colors = Object.fromEntries(
      [...block.matchAll(/--u-([\w-]+):\s*(#[\da-f]{6})/gi)].map((m) => [m[1], m[2]]),
    );
    for (const fg of ["ink", "body", "muted", "positive", "danger", "accent", "blue"]) {
      for (const bg of ["bg", "card", "surface"]) {
        const a = luminance(colors[fg]),
          b = luminance(colors[bg]);
        assert((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, `${fg} on ${bg}`);
      }
    }
  }
});

