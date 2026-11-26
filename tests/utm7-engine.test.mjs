import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDashboard, number, dateKey } from "../src/lib/utm7-engine.mjs";
const cid = "120255050101070580",
  sid = "120255050101080580",
  aid = "120255050101090580";
const offer = {
  id: "offer1",
  name: "Reconquiste — Plano",
  tracking_names: ["Reconquiste — Plano"],
  campaign_ids: [cid],
  active: true,
  cost_per_sale: 0,
};
const request = { since: "2026-11-26", until: "2026-11-26" };
const row = (event, n = 1, extra = {}) => ({
  event,
  event_id: `${event}_${n}__vid_browser_123456`,
  click_id: "click1",
  offer_name: offer.name,
  timestamp: "2026-11-26 12:00:00",
  utm_campaign: cid,
  utm_term: sid,
  utm_content: aid,
  ...extra,
});
const sale = (extra = {}) => ({
  event: "purchase",
  payment_id: "payment1",
  payment_status: "paid",
  value_gross: "14,97",
  fee_value: "1,25",
  product_title: offer.name,
  timestamp: "2026-11-26 12:05:00",
  click_id: "click1",
  ...extra,
});
const range = (name, rows) => {
  const keys = [...new Set(rows.flatMap(Object.keys))];
  return {
    range: `${name}!A1:AI100`,
    values: [keys, ...rows.map((r) => keys.map((k) => r[k] ?? ""))],
  };
};
const run = (tracking = [], sales = [], catalog = {}, params = {}) =>
  buildDashboard(
    { valueRanges: [range("tracking", tracking), range("vendas", sales)] },
    { offers: [offer], ...catalog },
    { ...request, ...params },
  );
const meta = {
  payload: {
    adsets: [
      {
        id: sid,
        name: "CTV 01",
        daily_budget: "1000",
        effective_status: "ACTIVE",
        campaign: { id: cid, name: "ABO 01", status: "ACTIVE" },
        ads: { data: [{ id: aid, name: "Vídeo 01", effective_status: "ACTIVE" }] },
      },
    ],
    daily: [
      {
        campaign_id: cid,
        adset_id: sid,
        ad_id: aid,
        date_start: "2026-11-26",
        spend: "10.00",
        impressions: "1000",
        inline_link_clicks: "20",
        actions: [{ action_type: "video_view", value: "200" }],
      },
    ],
    period: {
      campaign: [{ campaign_id: cid, campaign_name: "ABO 01", frequency: "1.25" }],
      adset: [{ adset_id: sid, adset_name: "CTV 01", frequency: "1.26" }],
      ad: [{ ad_id: aid, ad_name: "Vídeo 01", frequency: "1.27" }],
    },
  },
  synced_at: "2026-11-26T15:00:00Z",
};
test("parse monetary values and Brasília dates without timezone drift", () => {
  assert.equal(number("R$ 1.234,56"), 1234.56);
  assert.equal(number("14.97"), 14.97);
  assert.equal(dateKey("2026-11-27T01:00:00Z"), "2026-11-26");
  assert.equal(dateKey("26/11/2026"), "2026-11-26");
});
test("pageviews remain raw; visitors and IC are deduplicated per browser/day", () => {
  const d = run([
    row("page_view"),
    row("page_view", 2),
    row("initiate_checkout"),
    row("initiate_checkout", 2),
  ]);
  assert.equal(d.totals.pageViews, 2);
  assert.equal(d.totals.visitors, 1);
  assert.equal(d.totals.checkouts, 1);
  assert.equal(d.tables.ad[0].checkouts, 1);
});
test("the same visitor can count on a new day; missing persistent ID is reported", () => {
  const d = run(
    [
      row("page_view"),
      row("page_view", 2, { timestamp: "2026-11-27 12:00:00" }),
      row("page_view", 3, { event_id: "legacy_event", click_id: "legacy_click" }),
    ],
    [],
    {},
    { until: "2026-11-27" },
  );
  assert.equal(d.totals.pageViews, 3);
  assert.equal(d.totals.visitors, 2);
  assert.equal(d.quality.unidentifiable, 1);
});
test("diagnostics never count as visits, IC or purchases", () => {
  const d = run(
    [row("diagnostico_page_view"), row("page_view", 2, { utm_source: "diagnostico" })],
    [sale({ event: "diagnostico_purchase" })],
  );
  assert.equal(d.totals.pageViews, 0);
  assert.equal(d.totals.purchases, 0);
  assert.equal(d.quality.excludedDiagnostics, 3);
});
test("pending payments do not convert and repeated approved webhooks count once", () => {
  const s = sale();
  const d = run(
    [row("page_view")],
    [sale({ event: "pix_gerado", payment_status: "pending" }), s, s],
  );
  assert.equal(d.totals.purchases, 1);
  assert.equal(d.totals.paymentAttempts, 1);
  assert.equal(d.totals.revenue, 14.97);
  assert.equal(d.totals.fees, 1.25);
  assert.equal(d.tables.ad[0].purchases, 1);
});

test("LP IC and actual payment attempts are separate funnel stages", () => {
  const pix = sale({ event: "pix_gerado", payment_status: "pending", payment_id: "pix1" });
  const refused = sale({
    event: "payment_refused",
    payment_status: "refused",
    payment_method: "credit_card",
    payment_id: "card1",
  });
  const d = run(
    [row("initiate_checkout"), row("initiate_checkout", 2)],
    [pix, pix, refused, refused, sale()],
    { report: meta },
  );
  assert.equal(d.totals.checkouts, 1);
  assert.equal(d.totals.paymentAttempts, 3);
  assert.equal(d.totals.purchases, 1);
  assert.equal(d.totals.costPaymentAttempt, 10 / 3);
  assert.equal(d.totals.paymentAttemptRate, 300);
  assert.equal(d.tables.ad[0].paymentAttempts, 3);
  assert.equal(d.daily[0].paymentAttempts, 3);
});

test("payment status updates count once and direct approval proves a payment attempt", () => {
  const d = run(
    [],
    [sale({ event: "payment_declined", payment_status: "declined" }), sale(), sale()],
  );
  assert.equal(d.totals.checkouts, 0);
  assert.equal(d.totals.paymentAttempts, 1);
  assert.equal(d.totals.purchases, 1);
});

test("payment attempts use their first received timestamp across periods", () => {
  const pending = sale({
    event: "pix_gerado",
    payment_status: "pending",
    timestamp: "2026-11-25 12:00:00",
  });
  const d = run([], [sale(), pending]);
  assert.equal(d.totals.paymentAttempts, 0);
  assert.equal(d.totals.purchases, 1);
});

test("abandonment, refund-only, diagnostics, unknown states and invalid approvals do not invent attempts", () => {
  const sales = [
    sale({ event: "cart_abandoned", payment_status: "pending", payment_id: "abandoned" }),
    sale({ event: "payment_refunded", payment_status: "refunded", payment_id: "refund" }),
    sale({ event: "payment_chargeback", payment_status: "chargeback", payment_id: "chargeback" }),
    sale({ event: "payment_canceled", payment_status: "canceled", payment_id: "canceled" }),
    sale({ event: "diagnostico_pix_gerado", payment_status: "pending", payment_id: "diagnostic" }),
    sale({ event: "payment_unknown", payment_status: "unknown", payment_id: "unknown" }),
    sale({ payment_id: "invalid", value_gross: 0 }),
    sale({ event: "pix_gerado", payment_status: "pending", payment_id: "" }),
  ];
  const d = run([row("initiate_checkout")], sales);
  assert.equal(d.totals.checkouts, 1);
  assert.equal(d.totals.paymentAttempts, 0);
  assert.equal(d.totals.costPaymentAttempt, null);
});

test("payment attempts inherit only matching click attribution and respect campaign filters", () => {
  const d = run(
    [row("page_view")],
    [sale({ event: "payment_rejected", payment_status: "rejected" })],
  );
  assert.equal(d.tables.ad.find((r) => r.id === aid).paymentAttempts, 1);
  const other = run(
    [row("page_view")],
    [sale({ event: "payment_rejected", payment_status: "rejected" })],
    {},
    { campaign_id: "999999999999" },
  );
  assert.equal(other.totals.paymentAttempts, 0);
});
test("sales without UTMs inherit the matching click session only", () => {
  const d = run([row("page_view")], [sale(), sale({ payment_id: "payment2", click_id: "other" })]);
  assert.equal(d.tables.ad.find((r) => r.id === aid).purchases, 1);
  assert.equal(d.tables.ad.find((r) => r.id === "unattributed").purchases, 1);
  assert.equal(d.quality.unattributedPurchases, 1);
});
test("zero denominators remain unavailable rather than fabricated zero costs", () => {
  const d = run();
  assert.equal(d.totals.cpa, null);
  assert.equal(d.totals.cpc, null);
  assert.equal(d.totals.roi, null);
  assert.equal(d.totals.roas, null);
});
test("CPA, link CTR, CPC, ROAS and ROI use source totals and actual fees", () => {
  const d = run([row("page_view")], [sale()], { report: meta });
  assert.equal(d.totals.spend, 10);
  assert.equal(d.totals.cpc, 0.5);
  assert.equal(d.totals.ctr, 2);
  assert.equal(d.totals.cpm, 10);
  assert.equal(d.totals.roas, 1.497);
  assert.ok(Math.abs(d.totals.roi - 37.2) < 0.00001);
  assert.equal(d.totals.hookRate, 20);
});
test("frequency uses the matching period and level instead of summing ad/daily frequency", () => {
  const d = run([], [], { report: meta });
  assert.equal(d.tables.ad[0].frequency, 1.27);
  assert.equal(d.tables.adset[0].frequency, 1.26);
  assert.equal(d.tables.campaign[0].frequency, 1.25);
});
test("zero-delivery adsets remain listed with their real daily budget", () => {
  const report = { ...meta, payload: { ...meta.payload, daily: [] } };
  const d = run([], [], { report });
  assert.equal(d.tables.adset.length, 1);
  assert.equal(d.tables.adset[0].budgetMinor, 1000);
  assert.equal(d.tables.adset[0].spend, 0);
});
test("another offer and unrelated campaigns never inflate selected-offer totals", () => {
  const other = { ...offer, id: "other", name: "Outro produto", campaign_ids: ["999999999999999"] };
  const d = run(
    [
      row("page_view", 1, {
        offer_name: other.name,
        utm_campaign: "999999999999999",
        utm_term: "888888888888888",
        utm_content: "777777777777777",
      }),
    ],
    [sale({ product_title: other.name })],
    { offers: [offer, other], report: meta },
    { offer_id: "other" },
  );
  assert.equal(d.totals.spend, 0);
  assert.equal(d.totals.purchases, 1);
  assert.equal(
    d.tables.ad.some((r) => r.id === aid),
    false,
  );
});
test("refunds are deduplicated and reduce net revenue on their event date", () => {
  const refund = sale({ event: "payment_refunded", payment_status: "refunded" });
  const d = run([], [sale(), refund, refund]);
  assert.equal(d.totals.purchases, 1);
  assert.equal(d.totals.refunds, 1);
  assert.equal(d.totals.revenue, 14.97);
  assert.equal(d.totals.refundValue, 14.97);
  assert.ok(Math.abs(d.totals.netRevenue + 1.25) < 0.00001);
});
test("drilling into a different adset excludes all unmatched metrics", () => {
  const d = run([row("page_view")], [sale()], { report: meta }, { adset_id: "888888888888888" });
  assert.equal(d.totals.purchases, 0);
  assert.equal(d.totals.spend, 0);
  assert.equal(d.tables.adset.length, 0);
});
test("public dashboard contains neither buyer PII nor raw browser identifiers", () => {
  const d = run(
    [row("page_view")],
    [
      sale({
        email: "private@example.test",
        document: "12345678901",
        customer_name: "Private Buyer",
      }),
    ],
    { report: meta },
  );
  const json = JSON.stringify(d);
  assert.equal(
    /private@example|12345678901|Private Buyer|browser_123456|access_token/.test(json),
    false,
  );
});

test("refund with blank optional fields retains the original offer attribution", () => {
  const refund = sale({
    event: "payment_refunded",
    payment_status: "refunded",
    product_title: "",
    click_id: "",
    timestamp: "2026-11-26 13:00:00",
  });
  const d = run([], [sale(), refund]);
  assert.equal(d.totals.refunds, 1);
});

