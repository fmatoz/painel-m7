export function columnPreferences(saved, keys, defaults) {
  const clean = (list) => [
    ...new Set(Array.isArray(list) ? list.filter((k) => keys.includes(k)) : []),
  ];
  const order = clean(saved?.order);
  return {
    order: [...order, ...keys.filter((k) => !order.includes(k))],
    visible: saved && Array.isArray(saved.visible) ? clean(saved.visible) : [...defaults],
  };
}

export function moveColumn(order, from, to) {
  if (from === to || !order.includes(from) || !order.includes(to)) return order;
  const next = order.filter((k) => k !== from);
  next.splice(order.indexOf(to), 0, from);
  return next;
}

export function filterMetricRows(rows, search, activeOnly) {
  const term = search.trim().toLocaleLowerCase("pt-BR");
  return rows.filter(
    (r) =>
      (!activeOnly || r.status === "ACTIVE") &&
      (r.name.toLocaleLowerCase("pt-BR").includes(term) || r.id.includes(term)),
  );
}

// Sum volumes first, then recompute rates. Frequencies cannot be added or averaged.
export function summarizeMetricRows(rows) {
  const keys = [
    "spend",
    "impressions",
    "clicks",
    "video3s",
    "videoPlays",
    "metaLpViews",
    "metaPurchases",
    "pageViews",
    "visitors",
    "checkouts",
    "purchases",
    "revenue",
    "fees",
    "refunds",
    "refundValue",
    "productCost",
    "vslPlay",
    "vsl25",
    "vsl50",
    "vsl75",
    "vslComplete",
    "budgetMinor",
  ];
  const m = Object.fromEntries(
    keys.map((k) => [k, rows.reduce((n, r) => n + (Number(r[k]) || 0), 0)]),
  );
  const ratio = (n, d, scale = 1) => (d > 0 ? (n / d) * scale : null);
  const netRevenue = m.revenue - m.fees - m.refundValue;
  const profit = netRevenue - m.productCost - m.spend;
  return {
    ...m,
    netRevenue,
    profit,
    frequency: null,
    status: "",
    cpa: ratio(m.spend, m.purchases),
    cpc: ratio(m.spend, m.clicks),
    ctr: ratio(m.clicks, m.impressions, 100),
    cpm: ratio(m.spend, m.impressions, 1000),
    roas: ratio(m.revenue, m.spend),
    roi: ratio(profit, m.spend, 100),
    hookRate: ratio(m.video3s, m.impressions, 100),
    lpRate: ratio(m.visitors, m.clicks, 100),
    costLp: ratio(m.spend, m.visitors),
    metaCostLp: ratio(m.spend, m.metaLpViews),
    metaLpRate: ratio(m.metaLpViews, m.clicks, 100),
    checkoutRate: ratio(m.checkouts, m.visitors, 100),
    costCheckout: ratio(m.spend, m.checkouts),
    conversionRate: ratio(m.purchases, m.checkouts, 100),
    averageTicket: ratio(m.revenue, m.purchases),
  };
}
