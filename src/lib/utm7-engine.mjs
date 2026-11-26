export function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const s = String(value ?? "").replace(/R\$|\s/g, "");
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
}

export function dateKey(value) {
  const s = String(value ?? "");
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(s)) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime()))
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d);
    }
    return s.slice(0, 10);
  }
  return "";
}

export function sheetRows(valueRange) {
  const rows = valueRange?.values ?? [];
  const headers = rows[0] ?? [];
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])));
}

const normalize = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const ratio = (n, d, m = 1) => (d > 0 ? (n / d) * m : null);
const idFrom = (s) =>
  String(s ?? "")
    .split("||cid:")[0]
    .match(/(?:^|\|)(\d{8,30})(?:$|\|)/)?.[1] ?? "";
const action = (a, type) => number((a ?? []).find((x) => x.action_type === type)?.value);
const eventDate = (row) => dateKey(row.timestamp || row.data);
const isTest = (row) =>
  /diagnostico|diagnostic|^diag_|^audit_|^qa_/i.test(
    `${row.event} ${row.event_id} ${row.payment_id ?? ""}`,
  ) ||
  /diagnostico|qa_sem_venda|validacao_final/i.test(
    `${row.utm_source} ${row.utm_campaign} ${row.utm_content}`,
  ) ||
  /tracking_test=1/.test(row.page_url ?? "");
const emptyMetrics = () => ({
  spend: 0,
  impressions: 0,
  clicks: 0,
  video3s: 0,
  videoPlays: 0,
  metaLpViews: 0,
  metaPurchases: 0,
  pageViews: 0,
  visitors: 0,
  checkouts: 0,
  purchases: 0,
  revenue: 0,
  fees: 0,
  refunds: 0,
  refundValue: 0,
  productCost: 0,
  vslPlay: 0,
  vsl25: 0,
  vsl50: 0,
  vsl75: 0,
  vslComplete: 0,
});
const finishMetrics = (m) => ({
  ...m,
  netRevenue: m.revenue - m.fees - m.refundValue,
  profit: m.revenue - m.fees - m.refundValue - m.productCost - m.spend,
  cpa: ratio(m.spend, m.purchases),
  cpc: ratio(m.spend, m.clicks),
  ctr: ratio(m.clicks, m.impressions, 100),
  cpm: ratio(m.spend, m.impressions, 1000),
  roas: ratio(m.revenue, m.spend),
  roi: ratio(m.revenue - m.fees - m.refundValue - m.productCost - m.spend, m.spend, 100),
  hookRate: ratio(m.video3s, m.impressions, 100),
  lpRate: ratio(m.visitors, m.clicks, 100),
  costLp: ratio(m.spend, m.visitors),
  metaCostLp: ratio(m.spend, m.metaLpViews),
  metaLpRate: ratio(m.metaLpViews, m.clicks, 100),
  checkoutRate: ratio(m.checkouts, m.visitors, 100),
  costCheckout: ratio(m.spend, m.checkouts),
  conversionRate: ratio(m.purchases, m.checkouts, 100),
  averageTicket: ratio(m.revenue, m.purchases),
});

/** Aggregates private source rows. No customer identifiers leave this function. */
export function buildDashboard(sheet, catalog, request) {
  const offers = catalog.offers ?? [];
  const selected = offers.filter((o) => (request.offer_id ? o.id === request.offer_id : o.active));
  const isSelected = (o) => o && selected.some((s) => s.id === o.id);
  const findOffer = (r) =>
    offers.find((o) =>
      [o.name, ...(o.tracking_names ?? [])]
        .map(normalize)
        .some(
          (n) =>
            n && [r.offer_name, r.product_title, r.checkout_title].some((s) => normalize(s) === n),
        ),
    ) ?? null;
  const ranges = sheet?.valueRanges ?? [];
  const rawTracking = sheetRows(ranges.find((r) => /^'?tracking'?\!/.test(r.range)));
  const rawSales = sheetRows(ranges.find((r) => /^'?vendas'?\!/.test(r.range)));
  const tracking = rawTracking.filter((r) => !isTest(r));
  const sales = rawSales.filter((r) => !isTest(r));
  const report = catalog.report?.payload ?? null;
  const adsets = report?.adsets ?? [];
  const ads = new Map();
  const setMap = new Map(adsets.map((s) => [s.id, s]));
  for (const s of adsets)
    for (const a of s.ads?.data ?? [])
      ads.set(a.id, { ...a, adset_id: s.id, campaign_id: s.campaign?.id });
  for (const a of report?.period?.ad ?? [])
    if (!ads.has(a.ad_id))
      ads.set(a.ad_id, {
        id: a.ad_id,
        name: a.ad_name,
        adset_id: a.adset_id,
        campaign_id: a.campaign_id,
      });

  const campaignsByOffer = new Map(
    offers.map((o) => [o.id, new Set((o.campaign_ids ?? []).map(String))]),
  );
  for (const r of tracking) {
    const offer = findOffer(r);
    const campaignId = idFrom(r.utm_campaign);
    if (offer && campaignId && !offer.campaign_ids?.length)
      campaignsByOffer.get(offer.id).add(campaignId);
  }
  const campaignIds = new Set(selected.flatMap((o) => [...campaignsByOffer.get(o.id)]));
  const campaignOffer = (id) => offers.find((o) => campaignsByOffer.get(o.id)?.has(id));
  const resolve = (r) => {
    let campaign_id = idFrom(r.utm_campaign),
      adset_id = idFrom(r.utm_term),
      ad_id = idFrom(r.utm_content_original || r.utm_content || r.utm_content_raw);
    const ad = ads.get(ad_id);
    if (ad) {
      campaign_id ||= ad.campaign_id;
      adset_id ||= ad.adset_id;
    }
    if (setMap.has(adset_id)) campaign_id ||= setMap.get(adset_id).campaign?.id;
    return { campaign_id, adset_id, ad_id };
  };
  const matches = (a) =>
    (!request.campaign_id || request.campaign_id === a.campaign_id) &&
    (!request.adset_id || request.adset_id === a.adset_id);
  const inPeriod = (d) => d && d >= request.since && d <= request.until;
  const totals = emptyMetrics(),
    daily = new Map(),
    groups = { campaign: new Map(), adset: new Map(), ad: new Map() };
  const unique = {
    visitors: new Set(),
    checkouts: new Set(),
    vslPlay: new Set(),
    vsl25: new Set(),
    vsl50: new Set(),
    vsl75: new Set(),
    vslComplete: new Set(),
  };
  const groupUnique = new Map();
  for (
    let d = new Date(request.since + "T12:00:00Z");
    d.toISOString().slice(0, 10) <= request.until;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const date = d.toISOString().slice(0, 10);
    daily.set(date, { date, ...emptyMetrics() });
  }
  const group = (level, id, a = {}) => {
    const key = id || "unattributed";
    if (!groups[level].has(key)) {
      const set = setMap.get(level === "adset" ? id : a.adset_id);
      const ad = ads.get(id);
      const name = level === "ad" ? ad?.name : level === "adset" ? set?.name : set?.campaign?.name;
      groups[level].set(key, {
        id: key,
        level,
        name: name || (id ? `ID ${id}` : "Sem atribuição"),
        campaign_id: a.campaign_id || (level === "campaign" ? id : ""),
        adset_id: a.adset_id || (level === "adset" ? id : ""),
        status:
          level === "campaign"
            ? set?.campaign?.status
            : level === "adset"
              ? set?.effective_status
              : ad?.effective_status,
        budgetMinor: level === "adset" ? number(set?.daily_budget) : null,
        frequency: null,
        ...emptyMetrics(),
      });
    }
    return groups[level].get(key);
  };
  const add = (field, value, date, a, dedupe = "") => {
    if (dedupe) {
      if (unique[field].has(dedupe)) return;
      unique[field].add(dedupe);
    }
    totals[field] += value;
    if (daily.has(date)) daily.get(date)[field] += value;
    for (const level of ["campaign", "adset", "ad"]) {
      const id = a[level + "_id"] || "";
      const g = group(level, id, a);
      if (dedupe) {
        const k = `${level}:${g.id}:${field}`;
        if (!groupUnique.has(k)) groupUnique.set(k, new Set());
        const seen = groupUnique.get(k);
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
      }
      g[field] += value;
    }
  };
  const byClick = new Map();
  for (const r of tracking)
    if (r.click_id) {
      const a = resolve(r);
      if (a.ad_id || a.campaign_id) byClick.set(r.click_id, { ...a, offer: findOffer(r) });
    }
  let unidentifiable = 0,
    unattributedCheckouts = 0;
  const eventIds = new Set();
  const vslFields = {
    vsl_play: "vslPlay",
    vsl_25: "vsl25",
    vsl_50: "vsl50",
    vsl_75: "vsl75",
    vsl_complete: "vslComplete",
  };
  for (const r of tracking) {
    const offer = findOffer(r);
    if (!isSelected(offer)) continue;
    const date = eventDate(r),
      a = resolve(r);
    if (!inPeriod(date) || !matches(a)) continue;
    if (r.event_id && eventIds.has(r.event_id)) continue;
    if (r.event_id) eventIds.add(r.event_id);
    const browser = String(r.event_id).match(/__vid_([A-Za-z0-9_-]{8,100})$/)?.[1];
    const identity = browser || r.click_id || r.event_id;
    if (r.event === "page_view") {
      add("pageViews", 1, date, a);
      if (browser) add("visitors", 1, date, a, `${offer.id}:${date}:${browser}`);
      else unidentifiable++;
    }
    if (r.event === "initiate_checkout" && identity) {
      const key = `${offer.id}:${date}:${identity}`;
      if (!a.ad_id && !unique.checkouts.has(key)) unattributedCheckouts++;
      add("checkouts", 1, date, a, key);
    }
    if (vslFields[r.event] && identity)
      add(vslFields[r.event], 1, date, a, `${offer.id}:${date}:${identity}`);
  }
  const paid = new Map(),
    reversed = new Map();
  for (const r of sales) {
    const payment = String(r.payment_id || "").trim();
    if (!payment) continue;
    if (
      r.event === "purchase" &&
      (r.payment_status === "" || /^(paid|approved|completed)$/i.test(r.payment_status)) &&
      number(r.value_gross) > 0
    ) {
      if (!paid.has(payment) || String(r.timestamp) < String(paid.get(payment).timestamp))
        paid.set(payment, r);
    }
    if (
      /^(refund|refunded|chargeback|payment_refund|payment_refunded|payment_chargeback|payment_chargedback)$/.test(
        r.event,
      )
    ) {
      if (!reversed.has(payment) || String(r.timestamp) < String(reversed.get(payment).timestamp))
        reversed.set(payment, r);
    }
  }
  const recent = [];
  let unattributedPurchases = 0;
  const salesContext = (r) => {
    const fallback = byClick.get(r.click_id);
    const resolved = resolve(r);
    const a = {
      campaign_id: resolved.campaign_id || fallback?.campaign_id || "",
      adset_id: resolved.adset_id || fallback?.adset_id || "",
      ad_id: resolved.ad_id || fallback?.ad_id || "",
    };
    const offer = findOffer(r) || fallback?.offer || campaignOffer(a.campaign_id);
    return { a, offer, date: eventDate(r) };
  };
  for (const r of paid.values()) {
    const { a, offer, date } = salesContext(r);
    if (!isSelected(offer) || !inPeriod(date) || !matches(a)) continue;
    add("purchases", 1, date, a);
    add("revenue", number(r.value_gross), date, a);
    add("fees", number(r.fee_value), date, a);
    add("productCost", number(offer.cost_per_sale), date, a);
    if (!a.ad_id) unattributedPurchases++;
    recent.push({
      date,
      timestamp: r.timestamp,
      offer: offer.name,
      value: number(r.value_gross),
      method: r.payment_method || "",
      attributed: Boolean(a.ad_id),
    });
  }
  for (const [payment, r] of reversed) {
    const enriched = { ...paid.get(payment) };
    for (const [key, value] of Object.entries(r)) if (value !== "") enriched[key] = value;
    const context = salesContext(enriched);
    const { a, offer, date } = context;
    if (!isSelected(offer) || !inPeriod(date) || !matches(a)) continue;
    add("refunds", 1, date, a);
    add("refundValue", number(r.value_gross) || number(paid.get(payment)?.value_gross), date, a);
  }
  // Meta metrics are independent of Sheets conversions and never replace actual sales.
  for (const r of report?.daily ?? []) {
    if (!campaignIds.has(r.campaign_id)) continue;
    const a = { campaign_id: r.campaign_id, adset_id: r.adset_id, ad_id: r.ad_id };
    if (!matches(a) || !inPeriod(r.date_start)) continue;
    const values = {
      spend: number(r.spend),
      impressions: number(r.impressions),
      clicks: number(r.inline_link_clicks),
      video3s: action(r.actions, "video_view"),
      videoPlays: action(r.video_play_actions, "video_view"),
      metaLpViews: action(r.actions, "landing_page_view"),
      metaPurchases:
        action(r.actions, "offsite_conversion.fb_pixel_purchase") ||
        action(r.actions, "omni_purchase"),
    };
    for (const [field, value] of Object.entries(values)) add(field, value, r.date_start, a);
  }
  // Keep zero-delivery entities visible. Frequency comes from exact period/level rows.
  for (const s of adsets) {
    const a = { campaign_id: s.campaign?.id, adset_id: s.id };
    if (!campaignIds.has(a.campaign_id) || !matches(a)) continue;
    group("campaign", a.campaign_id, a);
    group("adset", s.id, a);
    for (const ad of s.ads?.data ?? []) group("ad", ad.id, { ...a, ad_id: ad.id });
  }
  for (const level of ["campaign", "adset", "ad"])
    for (const r of report?.period?.[level] ?? []) {
      const g = groups[level].get(r[level + "_id"]);
      if (g) {
        g.frequency = number(r.frequency) || null;
        g.name = r[level + "_name"] || g.name;
      }
    }
  const views = {};
  for (const level of ["campaign", "adset", "ad"])
    views[level] = [...groups[level].values()]
      .map(finishMetrics)
      .sort((a, b) => b.spend - a.spend || b.revenue - a.revenue || a.name.localeCompare(b.name));
  const knownVisitorCount = unique.visitors.size;
  return {
    offers,
    connections: catalog.connections ?? [],
    audit: catalog.audit ?? [],
    since: request.since,
    until: request.until,
    totals: finishMetrics(totals),
    daily: [...daily.values()].map(finishMetrics),
    tables: views,
    recentSales: recent
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
      .slice(0, 8),
    quality: {
      unidentifiable,
      unattributedCheckouts,
      unattributedPurchases,
      knownVisitorCount,
      excludedDiagnostics: rawTracking.filter(isTest).length + rawSales.filter(isTest).length,
      sheetsOk: !sheet?.error,
      metaConnected: Boolean(report),
      metaSyncedAt: catalog.report?.synced_at ?? null,
      sourceRows: rawTracking.length,
      salesRows: rawSales.length,
    },
    updatedAt: new Date().toISOString(),
    campaignIds: [...campaignIds],
  };
}
