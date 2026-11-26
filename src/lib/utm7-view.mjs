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

export function funnelGeometry(values) {
  const volumes = values.map((v) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null,
  );
  const maximum = Math.max(1, ...volumes.map((v) => v ?? 0));
  const heights = volumes.map((v) => ((v ?? 0) / maximum) * 92);
  const width = volumes.length * 220;
  const side = (sign) => heights.map((h) => 120 + sign * h);
  const top = side(-1),
    bottom = side(1);
  let path = `M0,${top[0] ?? 120}`;
  for (let i = 0; i < volumes.length; i++) {
    const end = (i + 1) * 220;
    path += ` L${i === volumes.length - 1 ? end : end - 45},${top[i]}`;
    if (i < volumes.length - 1)
      path += ` C${end},${top[i]} ${end},${top[i + 1]} ${end + 45},${top[i + 1]}`;
  }
  path += ` L${width},${bottom.at(-1) ?? 120}`;
  for (let i = volumes.length - 1; i >= 0; i--) {
    const start = i * 220;
    path += ` L${i === 0 ? 0 : start + 45},${bottom[i]}`;
    if (i > 0)
      path += ` C${start},${bottom[i]} ${start},${bottom[i - 1]} ${start - 45},${bottom[i - 1]}`;
  }
  return {
    width,
    path: path + " Z",
    heights,
    percentages: volumes.map((v) => (volumes[0] > 0 && v != null ? (v / volumes[0]) * 100 : null)),
  };
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
    "paymentAttempts",
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
    costPaymentAttempt: ratio(m.spend, m.paymentAttempts),
    paymentAttemptRate: ratio(m.paymentAttempts, m.checkouts, 100),
    conversionRate: ratio(m.purchases, m.checkouts, 100),
    averageTicket: ratio(m.revenue, m.purchases),
  };
}

