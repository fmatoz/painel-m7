import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  Copy,
  Download,
  ExternalLink,
  Filter,
  FolderHeart,
  GripVertical,
  Layers3,
  Loader2,
  LogOut,
  Menu,
  MousePointer2,
  Moon,
  Sun,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useAppAccess } from "@/hooks/use-access";
import { utm7Api } from "@/lib/utm7-api";
import { bulkBudgetTargets, runBulkOperations, type BulkResult } from "@/lib/utm7-bulk.mjs";
import {
  funnelGeometry,
  columnPreferences,
  moveColumn,
  filterMetricRows,
  summarizeMetricRows,
  type ColumnPreferences,
} from "@/lib/utm7-view.mjs";
import type {
  DashboardData,
  Level,
  MetricRow,
  Metrics,
  UtmConnection,
  UtmOffer,
} from "@/lib/utm7-types";
import "../utm7.css";

export const Route = createFileRoute("/utm7")({
  head: () => ({
    meta: [
      { title: "UTM7 · Atribuição e performance" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Utm7,
});
const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const integer = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const decimal = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const dayLabel = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const shift = (date: string, days: number) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
type Tab = "overview" | "campaigns" | "funnel" | "offers" | "settings";
type Column = {
  key: keyof MetricRow;
  label: string;
  format: (n: any) => string;
  meta?: boolean;
  help?: string;
};
const columns: Column[] = [
  { key: "status", label: "Veiculação", format: statusLabel },
  {
    key: "budgetMinor",
    label: "Orçamento/dia",
    format: (n) => (n == null ? "—" : money(n / 100)),
    meta: true,
    help: "Disponível no nível de conjuntos de anúncios.",
  },
  { key: "spend", label: "Investimento", format: money, meta: true },
  {
    key: "purchases",
    label: "Compras",
    format: integer,
    help: "Pagamentos aprovados e deduplicados do Sheets.",
  },
  {
    key: "cpa",
    label: "CPA",
    format: money,
    meta: true,
    help: "Investimento ÷ compras confirmadas.",
  },
  { key: "revenue", label: "Receita", format: money },
  { key: "roas", label: "ROAS", format: (n) => (n == null ? "—" : decimal(n) + "x"), meta: true },
  {
    key: "roi",
    label: "ROI",
    format: pct,
    meta: true,
    help: "Lucro estimado ÷ investimento × 100. Inclui taxas, estornos e custo cadastrado.",
  },
  { key: "impressions", label: "Impressões", format: integer, meta: true },
  { key: "cpm", label: "CPM", format: money, meta: true },
  { key: "clicks", label: "Cliques no link", format: integer, meta: true },
  { key: "cpc", label: "CPC", format: money, meta: true },
  { key: "ctr", label: "CTR", format: pct, meta: true },
  { key: "metaLpViews", label: "Visualizações LP (Meta)", format: integer, meta: true },
  { key: "metaCostLp", label: "Custo/vis. LP (Meta)", format: money, meta: true },
  {
    key: "metaLpRate",
    label: "Taxa vis. LP (Meta)",
    format: pct,
    meta: true,
    help: "Visualizações da página de destino informadas pela Meta ÷ cliques no link.",
  },
  {
    key: "visitors",
    label: "Visitas únicas/dia",
    format: integer,
    help: "Um navegador identificado por oferta e dia. Trocar de dispositivo ou limpar dados pode gerar nova identificação.",
  },
  { key: "costLp", label: "Custo por visita", format: money, meta: true },
  {
    key: "lpRate",
    label: "Taxa de chegada",
    format: pct,
    meta: true,
    help: "Visitas únicas/dia registradas na LP ÷ cliques no link. Fontes e critérios diferentes podem gerar taxas acima de 100%.",
  },
  {
    key: "checkouts",
    label: "Compras iniciadas",
    format: integer,
    help: "Cliques no botão da oferta, deduplicados por navegador/sessão e dia. Não são vendas aprovadas.",
  },
  { key: "costCheckout", label: "Custo por IC", format: money, meta: true },
  { key: "video3s", label: "Reproduções 3s", format: integer, meta: true },
  {
    key: "hookRate",
    label: "Taxa de gancho",
    format: pct,
    meta: true,
    help: "Reproduções de vídeo de 3 segundos ÷ impressões.",
  },
  {
    key: "frequency",
    label: "Frequência",
    format: decimal,
    meta: true,
    help: "Frequência do período fornecida pela Meta para este nível; não é soma das frequências diárias.",
  },
  { key: "profit", label: "Lucro estimado", format: money, meta: true },
  { key: "refunds", label: "Estornos", format: integer },
  {
    key: "metaPurchases",
    label: "Compras Meta",
    format: integer,
    meta: true,
    help: "Conversões atribuídas pela Meta. Podem diferir dos pagamentos aprovados no Sheets.",
  },
];
const defaultCols = [
  "status",
  "budgetMinor",
  "spend",
  "purchases",
  "cpa",
  "revenue",
  "roas",
  "clicks",
  "cpc",
  "ctr",
  "visitors",
  "checkouts",
];
const nav = [
  { id: "overview", label: "Visão geral", icon: BarChart3 },
  { id: "campaigns", label: "Campanhas", icon: Layers3 },
  { id: "funnel", label: "Funil e VSL", icon: Filter },
  { id: "offers", label: "Minhas ofertas", icon: ShoppingBag },
  { id: "settings", label: "Integrações", icon: Settings2 },
] as const;

function Utm7() {
  const { session, user, loading: authLoading, signOut } = useAuth();
  const { profile, loading: accessLoading } = useAppAccess();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview"),
    [menu, setMenu] = useState(false),
    [since, setSince] = useState(today),
    [until, setUntil] = useState(today),
    [preset, setPreset] = useState("today");
  const [offerId, setOfferId] = useState(""),
    [connectionId, setConnectionId] = useState(""),
    [level, setLevel] = useState<Level>("adset");
  const [campaignId, setCampaignId] = useState(""),
    [adsetId, setAdsetId] = useState(""),
    [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: keyof MetricRow; direction: number }>({
    key: "spend",
    direction: -1,
  });
  const [columnPrefs, setColumnPrefs] = useState<ColumnPreferences>(() =>
    columnPreferences(
      null,
      columns.map((c) => c.key),
      defaultCols,
    ),
  );
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activeOnly, setActiveOnly] = useState(false);
  const [colDialog, setColDialog] = useState(false),
    [syncing, setSyncing] = useState(false);
  const [offerEdit, setOfferEdit] = useState<Partial<UtmOffer> | null>(null),
    [connEdit, setConnEdit] = useState<Partial<UtmConnection> | null>(null);
  const [budget, setBudget] = useState<MetricRow | null>(null),
    [saving, setSaving] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{
    action: "budget" | "ACTIVE" | "PAUSED";
    rows: MetricRow[];
    level: Level;
    sourceCount: number;
  } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  useEffect(() => {
    setSelected(new Set());
  }, [level, offerId, connectionId, campaignId, adsetId, since, until, activeOnly, search]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("utm7:columns:v2") || "null");
      const legacy = JSON.parse(localStorage.getItem("utm7:columns:v1") || "null");
      setColumnPrefs(
        columnPreferences(
          saved ||
            (Array.isArray(legacy)
              ? {
                  order: ["status", "budgetMinor", ...legacy],
                  visible: ["status", "budgetMinor", ...legacy],
                }
              : null),
          columns.map((c) => c.key),
          defaultCols,
        ),
      );
      setTheme(localStorage.getItem("utm7:theme") === "light" ? "light" : "dark");
      setActiveOnly(localStorage.getItem("utm7:active-only") === "true");
    } catch {}
  }, []);
  useEffect(() => {
    if (!authLoading && !session) window.location.replace("/login?next=%2Futm7");
  }, [authLoading, session]);
  const allowed = Boolean(profile?.active && profile.is_admin);
  const params = {
    since,
    until,
    offer_id: offerId,
    connection_id: connectionId,
    campaign_id: campaignId,
    adset_id: adsetId,
  };
  const validDates = Boolean(
    since &&
    until &&
    since <= until &&
    new Date(until).getTime() - new Date(since).getTime() <= 92 * 86400000,
  );
  const query = useQuery({
    queryKey: ["utm7", user?.id, params],
    enabled: Boolean(session && allowed && validDates),
    queryFn: () =>
      utm7Api<DashboardData>(session!.access_token, { action: "dashboard", ...params }),
    refetchInterval: 60000,
    retry: 1,
  });
  const data = query.data,
    m = data?.totals,
    hasMeta = data?.quality.metaConnected ?? false;
  useEffect(() => {
    if (!connectionId && data?.connections.length) setConnectionId(data.connections[0].id);
  }, [connectionId, data?.connections]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["utm7"] });
  const sync = async () => {
    if (!session || !connectionId) return;
    setSyncing(true);
    try {
      await utm7Api(session.access_token, { action: "sync_meta", ...params });
      await refresh();
      toast.success("Meta sincronizada.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };
  const syncAttempts = useRef(new Map<string, number>());
  useEffect(() => {
    if (!data || !connectionId || syncing || !validDates || !query.isSuccess) return;
    const key = `${connectionId}:${since}:${until}`;
    const now = Date.now();
    const lastSync = data.quality.metaSyncedAt ? new Date(data.quality.metaSyncedAt).getTime() : 0;
    if (now - lastSync < 600000 || now - (syncAttempts.current.get(key) || 0) < 600000) return;
    syncAttempts.current.set(key, now);
    void sync();
  }, [data?.updatedAt, connectionId, since, until, syncing, validDates, query.isSuccess]);
  const setRange = (key: string) => {
    setPreset(key);
    const end = today();
    if (key === "today") {
      setSince(end);
      setUntil(end);
    }
    if (key === "yesterday") {
      setSince(shift(end, -1));
      setUntil(shift(end, -1));
    }
    if (key === "7") {
      setSince(shift(end, -6));
      setUntil(end);
    }
    if (key === "30") {
      setSince(shift(end, -29));
      setUntil(end);
    }
  };
  const save = async (action: string, payload: Record<string, unknown>) => {
    if (!session) return false;
    setSaving(true);
    try {
      await utm7Api(session.access_token, { action, ...payload });
      await refresh();
      toast.success("Configuração salva.");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };
  const orderedColumns = columnPrefs.order
    .map((key) => columns.find((c) => c.key === key)!)
    .filter(
      (c) =>
        c && columnPrefs.visible.includes(c.key) && (c.key !== "budgetMinor" || level === "adset"),
    );
  const filtered = filterMetricRows(data?.tables[level] ?? [], search, activeOnly).sort((a, b) => {
    const av = a[sort.key],
      bv = b[sort.key];
    return (
      (typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""))) * sort.direction
    );
  });
  const filteredTotals = summarizeMetricRows(filtered);
  const selectable = filtered.filter((r) => /^\d{5,30}$/.test(r.id));
  const selectedRows = selectable.filter((r) => selected.has(r.id));
  const openBulk = (action: "budget" | "ACTIVE" | "PAUSED") => {
    if (!selectedRows.length || !connectionId) return;
    try {
      const rows =
        action === "budget"
          ? bulkBudgetTargets(selectedRows, level, data?.tables.adset || [])
          : selectedRows.map((r) => ({ ...r }));
      setBulk({
        action,
        rows,
        level: action === "budget" ? "adset" : level,
        sourceCount: selectedRows.length,
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const changeLevel = (next: Level) => {
    setLevel(next);
    setTab("campaigns");
    if (next === "campaign") {
      setCampaignId("");
      setAdsetId("");
    }
    if (next === "adset") setAdsetId("");
  };
  const drill = (r: MetricRow) => {
    if (level === "campaign") {
      setCampaignId(r.id === "unattributed" ? "" : r.id);
      setAdsetId("");
      setLevel("adset");
    } else if (level === "adset") {
      setCampaignId(r.campaign_id || "");
      setAdsetId(r.id === "unattributed" ? "" : r.id);
      setLevel("ad");
    }
  };
  const resetFilters = () => {
    setCampaignId("");
    setAdsetId("");
  };
  const exportCsv = () => {
    const cs = orderedColumns;
    const cell = (v: unknown) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const lines = [
      ["Nome", "ID", ...cs.map((c) => c.label)],
      ...filtered.map((r) => [
        r.name,
        r.id,
        ...cs.map((c) => (c.meta && !hasMeta ? "" : c.format(r[c.key]))),
      ]),
    ];
    const blob = new Blob(["\uFEFF" + lines.map((r) => r.map(cell).join(";")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `utm7-${level}-${since}-${until}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (authLoading || accessLoading || !session)
    return (
      <div className="utm7-loading">
        <Loader2 className="animate-spin" />
        <span>Carregando UTM7…</span>
      </div>
    );
  if (!allowed)
    return (
      <div className="utm7-loading">
        <ShieldCheck />
        <h1>Acesso restrito</h1>
        <p>O UTM7 está disponível para administradores ativos do M7.</p>
        <a href="/inicio">Voltar ao M7</a>
      </div>
    );
  return (
    <div className="utm7-app" data-u-theme={theme}>
      {menu && (
        <button className="u-overlay" aria-label="Fechar menu" onClick={() => setMenu(false)} />
      )}
      <aside className={`u-sidebar ${menu ? "u-open" : ""}`}>
        <a href="/utm7" className="u-brand">
          <span>
            utm<span>7</span>
          </span>
        </a>
        <div className="u-workspace">
          <span className="u-workspace-avatar">M7</span>
          <div>
            Meu workspace<small>Infoprodutos</small>
          </div>
          <ChevronsUpDown size={15} />
        </div>
        <span className="u-nav-label">PRINCIPAL</span>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setTab(n.id);
                setMenu(false);
              }}
              className={tab === n.id ? "active" : ""}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "offers" && <span className="u-count">{data?.offers.length ?? "—"}</span>}
            </button>
          ))}
        </nav>
        <div className="u-sidebar-note">
          <span className="u-live-dot" /> Dados conectados
          <p>
            Da primeira visita à venda.
            <br />
            Tudo no mesmo lugar.
          </p>
        </div>
        <div className="u-sidebar-bottom">
          <a href="/inicio">
            <ArrowLeft size={17} />
            Voltar ao Painel M7
            <ArrowUpRight size={15} />
          </a>
          <button onClick={() => setShowHelp(true)}>
            <CircleHelp size={17} />
            Como ler os números
          </button>
          <div className="u-user">
            <span>{(profile?.full_name || "Felipe").slice(0, 1)}</span>
            <div>
              {profile?.full_name || "Administrador"}
              <small>Administrador</small>
            </div>
            <button aria-label="Sair" onClick={signOut}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="u-main">
        <header className="u-topbar">
          <div className="u-breadcrumb">
            <button className="u-menu" aria-label="Abrir menu" onClick={() => setMenu(true)}>
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === tab)?.label}</strong>
          </div>
          <div className="u-top-right">
            <button
              className="u-theme-toggle"
              aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
              onClick={() => {
                const next = theme === "dark" ? "light" : "dark";
                setTheme(next);
                try {
                  localStorage.setItem("utm7:theme", next);
                } catch {}
              }}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>
            </button>
            <span className="u-access">
              <ShieldCheck size={14} />
              Acesso privado
            </span>
            <button className="u-icon-button" aria-label="Ajuda" onClick={() => setShowHelp(true)}>
              <CircleHelp size={19} />
            </button>
          </div>
        </header>
        <div className="u-content">
          <section className="u-page-heading">
            <div>
              <div className="u-eyebrow">ATRIBUIÇÃO + PERFORMANCE</div>
              <h1>
                {tab === "overview"
                  ? "Cada clique conta."
                  : tab === "campaigns"
                    ? "Controle da operação."
                    : tab === "funnel"
                      ? "Do interesse à compra."
                      : tab === "offers"
                        ? "Uma central, várias ofertas."
                        : "Suas fontes de dados."}
              </h1>
              <p>
                {tab === "overview"
                  ? "Veja o que gera atenção, intenção e vendas de verdade."
                  : tab === "campaigns"
                    ? "Compare seus criativos e encontre onde o investimento faz sentido."
                    : tab === "funnel"
                      ? "Encontre onde a jornada avança — e onde ela perde força."
                      : tab === "offers"
                        ? "Cadastre produtos, pixels e campanhas para acompanhar cada projeto."
                        : "Conecte a Meta e acompanhe o rastreamento do Sheets."}
              </p>
            </div>
            <div className="u-heading-actions">
              <button
                className="u-button"
                onClick={() => query.refetch()}
                disabled={query.isFetching}
              >
                <RefreshCw size={16} className={query.isFetching ? "animate-spin" : ""} />
                Atualizar
              </button>
              <button
                className="u-button u-primary"
                disabled={!connectionId || syncing || !validDates}
                onClick={sync}
              >
                {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Sincronizar Meta
              </button>
            </div>
          </section>
          <div className="u-filters">
            <label>
              <ShoppingBag size={15} />
              <select
                aria-label="Selecionar oferta"
                value={offerId}
                onChange={(e) => {
                  setOfferId(e.target.value);
                  resetFilters();
                }}
              >
                <option value="">Todas as ofertas ativas</option>
                {data?.offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Layers3 size={15} />
              <select
                aria-label="Selecionar conta Meta"
                value={connectionId}
                onChange={(e) => {
                  setConnectionId(e.target.value);
                  resetFilters();
                }}
              >
                <option value="">Selecionar conta Meta</option>
                {data?.connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="u-date-filter">
              <select
                aria-label="Período"
                value={preset}
                onChange={(e) => setRange(e.target.value)}
              >
                <option value="today">Hoje</option>
                <option value="yesterday">Ontem</option>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="custom">Personalizado</option>
              </select>
              <input
                aria-label="Data inicial"
                type="date"
                value={since}
                max={until}
                onChange={(e) => {
                  setPreset("custom");
                  setSince(e.target.value);
                }}
              />
              <span>—</span>
              <input
                aria-label="Data final"
                type="date"
                value={until}
                min={since}
                onChange={(e) => {
                  setPreset("custom");
                  setUntil(e.target.value);
                }}
              />
            </div>
          </div>
          {!validDates && (
            <div className="u-notice u-error">
              Selecione datas válidas, em um intervalo de até 93 dias.
            </div>
          )}
          {query.error && (
            <div className="u-notice u-error" role="alert">
              {(query.error as Error).message}
              <button onClick={() => query.refetch()}>Tentar novamente</button>
            </div>
          )}
          {query.isLoading && (
            <div className="u-skeleton-grid" aria-label="Carregando dados">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} />
              ))}
            </div>
          )}
          {data && (
            <>
              <div className="u-source-line">
                <span>
                  <i className="u-live-dot" />
                  Sheets conectado
                </span>
                <span className={hasMeta ? "" : "u-muted"}>
                  <i className={`u-live-dot ${hasMeta ? "" : "u-inactive"}`} />
                  {hasMeta
                    ? "Meta: " +
                      new Date(data.quality.metaSyncedAt!).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "America/Sao_Paulo",
                      })
                    : "Meta: sincronize este período"}
                </span>
                <small>Horário de Brasília · atualização do funil a cada minuto</small>
              </div>
              {!hasMeta && (
                <div className="u-notice">
                  <TrendingUp size={18} />
                  <span>
                    O funil já está disponível. Sincronize a Meta para carregar investimento,
                    cliques e métricas de anúncio deste período.
                  </span>
                  <button onClick={sync} disabled={!connectionId || syncing}>
                    Sincronizar
                  </button>
                </div>
              )}
              {tab === "overview" && (
                <>
                  <div className="u-kpis">
                    <Kpi
                      label="Receita confirmada"
                      value={money(m!.revenue)}
                      note={`${integer(m!.purchases)} pagamentos aprovados`}
                      icon={<ShoppingBag />}
                      accent="green"
                    />
                    <Kpi
                      label="Investimento"
                      value={hasMeta ? money(m!.spend) : "—"}
                      note="Fonte: Meta Ads"
                      icon={<MousePointer2 />}
                    />
                    <Kpi
                      label="Lucro estimado"
                      value={hasMeta ? money(m!.profit) : "—"}
                      note="Após mídia, taxas, estornos e custo"
                      icon={<TrendingUp />}
                      accent={hasMeta && m!.profit < 0 ? "red" : "green"}
                    />
                    <Kpi
                      label="ROAS"
                      value={hasMeta && m!.roas != null ? decimal(m!.roas) + "x" : "—"}
                      note="Receita bruta ÷ investimento"
                      icon={<Target />}
                    />
                    <Kpi
                      label="Custo por compra"
                      value={hasMeta ? money(m!.cpa) : "—"}
                      note="Pagamentos aprovados no Sheets"
                      icon={<ShoppingBag />}
                    />
                    <Kpi
                      label="ROI"
                      value={hasMeta ? pct(m!.roi) : "—"}
                      note="Retorno sobre o investimento"
                      icon={<BarChart3 />}
                    />
                  </div>
                  <div className="u-chart-grid">
                    <section className="u-panel u-chart-panel">
                      <PanelTitle
                        title="Receita × investimento"
                        sub="Acompanhe a evolução no período"
                      />
                      <div className="u-chart-legend">
                        <span>
                          <i className="u-green" />
                          Receita confirmada
                        </span>
                        <span>
                          <i className="u-purple" />
                          Investimento Meta
                        </span>
                      </div>
                      <div className="u-chart">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={data.daily}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient id="uRevenue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#37cfa0" stopOpacity={0.2} />
                                <stop offset="100%" stopColor="#37cfa0" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              stroke="var(--u-line)"
                              strokeDasharray="4 4"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="date"
                              tickFormatter={dayLabel}
                              tick={{ fill: "var(--u-muted)", fontSize: 11 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              width={53}
                              tickFormatter={(v) => `R$ ${v}`}
                              tick={{ fill: "var(--u-muted)", fontSize: 11 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              formatter={(v: any, name: any) => [
                                money(Number(v)),
                                name === "revenue" ? "Receita" : "Investimento",
                              ]}
                              labelFormatter={dayLabel}
                              contentStyle={{
                                borderRadius: 10,
                                border: "1px solid var(--u-line)",
                                background: "var(--u-card)",
                                color: "var(--u-ink)",
                                fontSize: 12,
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="revenue"
                              stroke="#37cfa0"
                              strokeWidth={2.5}
                              fill="url(#uRevenue)"
                              isAnimationActive={false}
                            />
                            {hasMeta && (
                              <Area
                                type="monotone"
                                dataKey="spend"
                                stroke="#a879ff"
                                strokeWidth={2}
                                fill="transparent"
                                isAnimationActive={false}
                              />
                            )}
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="u-chart-footer">
                        <span>
                          Receita líquida de taxas e estornos{" "}
                          <strong>{money(m!.netRevenue)}</strong>
                        </span>
                        <span>
                          Ticket médio <strong>{money(m!.averageTicket)}</strong>
                        </span>
                      </div>
                    </section>
                    <section className="u-panel">
                      <PanelTitle
                        title="Funil de conversão"
                        sub="Da visita ao pagamento aprovado"
                      />
                      <MiniFunnel metrics={m!} hasMeta={hasMeta} />
                      <button className="u-text-button" onClick={() => setTab("funnel")}>
                        Explorar funil completo
                        <ArrowUpRight size={15} />
                      </button>
                    </section>
                  </div>
                  <div className="u-bottom-grid">
                    <section className="u-panel">
                      <PanelTitle
                        title="Criativos em destaque"
                        sub="Comparação por investimento"
                        action={
                          <button
                            className="u-text-button"
                            onClick={() => {
                              resetFilters();
                              setLevel("ad");
                              setTab("campaigns");
                            }}
                          >
                            Ver anúncios
                            <ArrowUpRight size={14} />
                          </button>
                        }
                      />
                      {data.tables.ad.filter((r) => r.id !== "unattributed").length ? (
                        <div className="u-top-ads">
                          {data.tables.ad
                            .filter((r) => r.id !== "unattributed")
                            .slice(0, 4)
                            .map((r, i) => (
                              <div key={r.id}>
                                <span className="u-rank">{String(i + 1).padStart(2, "0")}</span>
                                <div>
                                  <strong>{r.name}</strong>
                                  <small>
                                    {integer(r.purchases)} compras · {integer(r.checkouts)} IC
                                  </small>
                                </div>
                                <strong>{hasMeta ? money(r.spend) : "—"}</strong>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <Empty
                          title="Seus criativos aparecerão aqui"
                          text="Sincronize a Meta e vincule a campanha na oferta."
                        />
                      )}
                    </section>
                    <section className="u-panel">
                      <PanelTitle title="Últimas vendas" sub="Pagamentos confirmados no período" />
                      {data.recentSales.length ? (
                        <div className="u-sales-list">
                          {data.recentSales.map((s, i) => (
                            <div key={i}>
                              <span className="u-sale-icon">
                                <ShoppingBag size={17} />
                              </span>
                              <div>
                                <strong>{s.offer}</strong>
                                <small>
                                  {dayLabel(s.date)} · {s.method.toUpperCase()} ·{" "}
                                  {s.attributed ? "Com atribuição" : "Sem atribuição"}
                                </small>
                              </div>
                              <strong>{money(s.value)}</strong>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          title="Aguardando a primeira venda do período"
                          text="Pagamentos pendentes e eventos de teste não entram na receita."
                        />
                      )}
                    </section>
                  </div>
                </>
              )}
              {tab === "campaigns" && (
                <section className="u-panel u-campaign-panel">
                  <div className="u-table-toolbar">
                    <div className="u-level-tabs">
                      {(["campaign", "adset", "ad"] as const).map((l) => (
                        <button
                          key={l}
                          className={level === l ? "selected" : ""}
                          onClick={() => changeLevel(l)}
                        >
                          {l === "campaign"
                            ? "Campanhas"
                            : l === "adset"
                              ? "Conjuntos"
                              : "Anúncios"}
                          <span>{filterMetricRows(data.tables[l], "", activeOnly).length}</span>
                        </button>
                      ))}
                    </div>
                    <div className="u-table-actions">
                      <label className={`u-active-filter ${activeOnly ? "selected" : ""}`}>
                        <input
                          type="checkbox"
                          checked={activeOnly}
                          onChange={(e) => {
                            setActiveOnly(e.target.checked);
                            try {
                              localStorage.setItem("utm7:active-only", String(e.target.checked));
                            } catch {}
                          }}
                        />{" "}
                        Somente ativos
                      </label>
                      <label className="u-search">
                        <Search size={15} />
                        <input
                          placeholder="Buscar nome ou ID"
                          aria-label="Buscar campanhas"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      <button className="u-button" onClick={() => setColDialog(true)}>
                        <SlidersHorizontal size={15} />
                        Colunas
                      </button>
                      <button className="u-button" onClick={exportCsv}>
                        <Download size={15} />
                        Exportar
                      </button>
                    </div>
                  </div>
                  {(campaignId || adsetId) && (
                    <div className="u-drill-filter">
                      <Filter size={14} />
                      Filtrado por {adsetId ? "conjunto" : "campanha"}: {adsetId || campaignId}
                      <button onClick={resetFilters}>
                        Limpar filtro
                        <X size={13} />
                      </button>
                    </div>
                  )}
                  {selectedRows.length > 0 && (
                    <div className="u-bulk-bar">
                      <strong>{selectedRows.length} selecionados</strong>
                      <button
                        className="u-button"
                        disabled={!connectionId}
                        onClick={() => openBulk("ACTIVE")}
                      >
                        Ativar selecionados
                      </button>
                      <button
                        className="u-button"
                        disabled={!connectionId}
                        onClick={() => openBulk("PAUSED")}
                      >
                        Pausar selecionados
                      </button>
                      <button
                        className="u-button"
                        disabled={!connectionId || level === "campaign"}
                        title={
                          level === "campaign"
                            ? "O orçamento diário é editado nos conjuntos (ABO)."
                            : "Definir orçamento diário por conjunto"
                        }
                        onClick={() => openBulk("budget")}
                      >
                        Editar orçamento
                      </button>
                      <button className="u-text-button" onClick={() => setSelected(new Set())}>
                        Limpar seleção
                      </button>
                    </div>
                  )}
                  <div className="u-table-scroll">
                    <table className="u-table u-selectable">
                      <thead>
                        <tr>
                          <th className="u-selection-cell">
                            <input
                              type="checkbox"
                              aria-label="Selecionar até 50 itens visíveis"
                              disabled={!selectable.length}
                              checked={
                                selectable.length > 0 &&
                                selectedRows.length === Math.min(50, selectable.length)
                              }
                              ref={(el) => {
                                if (el)
                                  el.indeterminate =
                                    selectedRows.length > 0 &&
                                    selectedRows.length < Math.min(50, selectable.length);
                              }}
                              onChange={(e) =>
                                setSelected(
                                  e.target.checked
                                    ? new Set(selectable.slice(0, 50).map((r) => r.id))
                                    : new Set(),
                                )
                              }
                            />
                          </th>
                          <th className="u-sticky">
                            <button
                              onClick={() =>
                                setSort({
                                  key: "name",
                                  direction: sort.key === "name" ? -sort.direction : 1,
                                })
                              }
                            >
                              {level === "campaign"
                                ? "Campanha"
                                : level === "adset"
                                  ? "Conjunto de anúncios"
                                  : "Anúncio"}
                              <ChevronsUpDown size={13} />
                            </button>
                          </th>
                          {orderedColumns.map((c) => (
                            <th key={c.key} title={c.help}>
                              <button
                                onClick={() =>
                                  setSort({
                                    key: c.key,
                                    direction: sort.key === c.key ? -sort.direction : -1,
                                  })
                                }
                              >
                                {c.label}
                                <ChevronsUpDown size={12} />
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r) => (
                          <tr key={r.id}>
                            <td className="u-selection-cell">
                              <input
                                type="checkbox"
                                aria-label={`Selecionar ${r.name}`}
                                disabled={
                                  !/^\d{5,30}$/.test(r.id) ||
                                  (!selected.has(r.id) && selectedRows.length >= 50)
                                }
                                checked={selected.has(r.id)}
                                onChange={(e) =>
                                  setSelected((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(r.id);
                                    else next.delete(r.id);
                                    return next;
                                  })
                                }
                              />
                            </td>
                            <td className="u-sticky">
                              <button
                                className="u-entity-name"
                                onClick={() => drill(r)}
                                disabled={level === "ad" || r.id === "unattributed"}
                              >
                                {r.name}
                                {level !== "ad" && r.id !== "unattributed" && (
                                  <ChevronRight size={13} />
                                )}
                              </button>
                              <small>
                                {r.id === "unattributed" ? "Eventos sem IDs de anúncio" : r.id}
                              </small>
                            </td>
                            {orderedColumns.map((c) => (
                              <td
                                key={c.key}
                                className={
                                  c.key === "roi" && typeof r.roi === "number"
                                    ? r.roi >= 0
                                      ? "u-positive"
                                      : "u-negative"
                                    : ""
                                }
                              >
                                {c.key === "status" ? (
                                  <span
                                    className={`u-status ${r.status === "ACTIVE" ? "active" : ""}`}
                                  >
                                    {statusLabel(r.status)}
                                  </span>
                                ) : c.key === "budgetMinor" ? (
                                  <button
                                    className="u-budget"
                                    onClick={() => setBudget(r)}
                                    disabled={!hasMeta || !r.budgetMinor || !connectionId}
                                  >
                                    {r.budgetMinor ? money(r.budgetMinor / 100) : "—"}
                                    {Boolean(r.budgetMinor) && <Pencil size={12} />}
                                  </button>
                                ) : c.meta && !hasMeta ? (
                                  "—"
                                ) : (
                                  c.format(r[c.key])
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      {filtered.length > 0 && (
                        <tfoot>
                          <tr>
                            <td className="u-selection-cell" />
                            <td className="u-sticky">
                              {filtered.length}{" "}
                              {level === "ad"
                                ? "anúncios"
                                : level === "adset"
                                  ? "conjuntos"
                                  : "campanhas"}
                            </td>
                            {orderedColumns.map((c) => (
                              <td key={c.key}>
                                {c.key === "status"
                                  ? "Totais exibidos"
                                  : c.key === "frequency"
                                    ? "—"
                                    : c.meta && !hasMeta
                                      ? "—"
                                      : c.format(
                                          filteredTotals[c.key as keyof typeof filteredTotals],
                                        )}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                    {!filtered.length && (
                      <Empty
                        title="Nenhum resultado neste filtro"
                        text="Confira o período, sincronize a Meta ou ajuste o vínculo de campanhas na oferta."
                      />
                    )}
                  </div>
                  <div className="u-table-footnote">
                    Totais das linhas exibidas · Compras e receita: Sheets · Mídia: Meta Ads.{" "}
                    {query.isFetching ? "Atualizando…" : ""}
                  </div>
                </section>
              )}
              {tab === "funnel" && (
                <>
                  <div className="u-funnel-grid">
                    <section className="u-panel">
                      <PanelTitle
                        title="Jornada de compra"
                        sub="Da primeira visita ao pagamento aprovado"
                      />
                      <MiniFunnel metrics={m!} hasMeta={hasMeta} />
                      <div className="u-funnel-costs">
                        <div>
                          Custo por visita<strong>{hasMeta ? money(m!.costLp) : "—"}</strong>
                        </div>
                        <div>
                          Custo por IC<strong>{hasMeta ? money(m!.costCheckout) : "—"}</strong>
                        </div>
                        <div>
                          Custo por compra<strong>{hasMeta ? money(m!.cpa) : "—"}</strong>
                        </div>
                      </div>
                    </section>
                    <section className="u-panel">
                      <PanelTitle
                        title="Retenção da VSL"
                        sub="Eventos registrados pelo player da landing page"
                      />
                      <div className="u-vsl-steps">
                        {(
                          [
                            ["Play", "vslPlay"],
                            ["25%", "vsl25"],
                            ["50%", "vsl50"],
                            ["75%", "vsl75"],
                            ["Concluído", "vslComplete"],
                          ] as const
                        ).map(([label, k]) => (
                          <div key={k}>
                            <span>{label}</span>
                            <div>
                              <i
                                style={{
                                  width: `${m!.vslPlay ? Math.min(100, (m![k] / m!.vslPlay) * 100) : 0}%`,
                                }}
                              />
                            </div>
                            <strong>{integer(m![k])}</strong>
                            <small>{m!.vslPlay ? pct((m![k] / m!.vslPlay) * 100) : "—"}</small>
                          </div>
                        ))}
                      </div>
                      <p className="u-note">
                        Os marcos são eventos independentes; bloqueios de rastreamento ou sessões
                        diferentes podem causar pequenas diferenças.
                      </p>
                    </section>
                  </div>
                  <section className="u-panel">
                    <PanelTitle
                      title="Qualidade da atribuição"
                      sub="O que os dados conseguem identificar"
                    />
                    <div className="u-quality-grid">
                      <div>
                        <strong>{integer(data.quality.knownVisitorCount)}</strong>
                        <span>Visitas únicas/dia identificadas</span>
                      </div>
                      <div>
                        <strong>{integer(data.quality.unidentifiable)}</strong>
                        <span>PageViews sem ID persistente</span>
                      </div>
                      <div>
                        <strong>{integer(data.quality.unattributedPurchases)}</strong>
                        <span>Compras sem anúncio identificado</span>
                      </div>
                      <div>
                        <strong>{integer(data.quality.excludedDiagnostics)}</strong>
                        <span>Eventos de teste ignorados na fonte</span>
                      </div>
                    </div>
                    <p className="u-note">
                      PageViews brutos: {integer(m!.pageViews)}. Identificadores são do navegador;
                      não representam pessoas únicas entre dispositivos. Testes são excluídos pela
                      identificação técnica do evento.
                    </p>
                  </section>
                </>
              )}
              {tab === "offers" && (
                <>
                  <div className="u-section-top">
                    <span>{data.offers.length} ofertas cadastradas</span>
                    <button
                      className="u-button u-primary"
                      onClick={() =>
                        setOfferEdit({
                          active: true,
                          price: 0,
                          cost_per_sale: 0,
                          tracking_names: [],
                          campaign_ids: [],
                        })
                      }
                    >
                      <Plus size={16} />
                      Nova oferta
                    </button>
                  </div>
                  <div className="u-offers-grid">
                    {data.offers.map((o) => (
                      <article className="u-panel u-offer-card" key={o.id}>
                        <div className="u-offer-top">
                          <span className="u-offer-icon">
                            <FolderHeart size={25} />
                          </span>
                          <span className={`u-status ${o.active ? "active" : ""}`}>
                            {o.active ? "Ativa" : "Arquivada"}
                          </span>
                          <button
                            className="u-icon-button"
                            aria-label={`Editar ${o.name}`}
                            onClick={() => setOfferEdit(o)}
                          >
                            <Pencil size={16} />
                          </button>
                        </div>
                        <h2>{o.name}</h2>
                        <p className="u-offer-price">
                          {money(Number(o.price))}
                          <small>Preço de referência</small>
                        </p>
                        <dl>
                          <div>
                            <dt>Pixel Meta</dt>
                            <dd>{o.pixel_id || "Não informado"}</dd>
                          </div>
                          <div>
                            <dt>Campanhas vinculadas</dt>
                            <dd>{o.campaign_ids.length || "Por UTMs da LP"}</dd>
                          </div>
                          <div>
                            <dt>Identificação no Sheets</dt>
                            <dd>{o.tracking_names.length} nomes</dd>
                          </div>
                        </dl>
                        <div className="u-offer-links">
                          {o.landing_url && (
                            <a href={o.landing_url} target="_blank" rel="noreferrer">
                              Landing page
                              <ExternalLink size={13} />
                            </a>
                          )}
                          {o.checkout_url && (
                            <a href={o.checkout_url} target="_blank" rel="noreferrer">
                              Checkout
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                        <button
                          className="u-button u-full"
                          onClick={() => {
                            setOfferId(o.id);
                            resetFilters();
                            setTab("overview");
                          }}
                        >
                          Ver resultados
                          <ArrowUpRight size={15} />
                        </button>
                      </article>
                    ))}
                  </div>
                  <div className="u-notice">
                    <CircleHelp size={18} />
                    <span>
                      O pixel cadastrado identifica a oferta no UTM7. A instalação do pixel e os
                      webhooks de cada nova LP precisam ser configurados na origem.
                    </span>
                  </div>
                </>
              )}
              {tab === "settings" && (
                <>
                  <div className="u-integration-grid">
                    <section className="u-panel">
                      <PanelTitle
                        title="Meta Ads"
                        sub="Marketing API · campanhas, mídia e orçamento"
                        action={
                          <button className="u-button" onClick={() => setConnEdit({})}>
                            <Plus size={15} />
                            Conectar conta
                          </button>
                        }
                      />
                      {data.connections.map((c) => (
                        <div className="u-connection" key={c.id}>
                          <span className="u-meta-symbol">∞</span>
                          <div>
                            <strong>{c.name}</strong>
                            <small>
                              Conta {c.account_id} · {c.currency}
                            </small>
                          </div>
                          <button className="u-button" onClick={() => setConnEdit(c)}>
                            <Pencil size={13} />
                            Editar
                          </button>
                        </div>
                      ))}
                      <p className="u-note">
                        Use um token da Marketing API com acesso à conta. Leitura exige ads_read;
                        editar orçamento exige ads_management. O token fica no servidor e nunca
                        retorna para o navegador.
                      </p>
                    </section>
                    <section className="u-panel">
                      <PanelTitle
                        title="Google Sheets"
                        sub="Fonte central de visitas e pagamentos"
                      />
                      <div className="u-connection">
                        <span className="u-sheet-icon">
                          <BarChart3 size={25} />
                        </span>
                        <div>
                          <strong>Trackeamento Meta Ads</strong>
                          <small>tracking + vendas · conexão n8n existente</small>
                        </div>
                        <span className="u-status active">Conectado</span>
                      </div>
                      <p className="u-note">
                        O UTM7 lê as abas existentes sem alterar os fluxos de captura. Valores
                        financeiros são os registrados pelo webhook de pagamentos.
                      </p>
                      <a
                        className="u-text-button"
                        href="https://docs.google.com/spreadsheets/d/1AlhIIhi8NXxImk5TB_GDLpRNvtpi96SpFN0lv8Cd8ww/edit"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir planilha
                        <ExternalLink size={14} />
                      </a>
                    </section>
                  </div>
                  <section className="u-panel">
                    <PanelTitle
                      title="Parâmetros para os anúncios"
                      sub="Cole o mesmo código em Parâmetros de URL de todos os anúncios"
                    />
                    <div className="u-code">
                      <code>
                        utm_source={"{{site_source_name}}"}
                        &amp;utm_medium=paid_social&amp;utm_campaign={"{{campaign.id}}"}
                        &amp;utm_term={"{{adset.id}}"}&amp;utm_content={"{{ad.id}}"}
                      </code>
                      <button
                        aria-label="Copiar UTMs"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              "utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}",
                            );
                            toast.success("UTMs copiadas.");
                          } catch {
                            toast.error("Selecione e copie o código manualmente.");
                          }
                        }}
                      >
                        <Copy size={17} />
                      </button>
                    </div>
                    <p className="u-note">
                      A Meta substitui os parâmetros pelos IDs. O UTM7 cruza esses IDs com a conta
                      conectada para mostrar os nomes.
                    </p>
                  </section>
                  <section className="u-panel">
                    <PanelTitle
                      title="Histórico de orçamento"
                      sub="Alterações solicitadas pelo painel"
                    />
                    {data.audit.length ? (
                      <div className="u-audit-list">
                        {data.audit.map((a) => (
                          <div key={a.id}>
                            <span>Conjunto {a.adset_id}</span>
                            <strong>
                              {money(a.previous_budget / 100)} → {money(a.new_budget / 100)}
                            </strong>
                            <span
                              className={`u-status ${a.status === "confirmed" ? "active" : ""}`}
                            >
                              {a.status === "confirmed"
                                ? "Confirmado"
                                : a.status === "failed"
                                  ? "Falhou"
                                  : "Não concluído"}
                            </span>
                            <small>
                              {new Date(a.created_at).toLocaleString("pt-BR", {
                                timeZone: "America/Sao_Paulo",
                              })}
                            </small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="u-note">Nenhum orçamento foi alterado pelo UTM7.</p>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          <footer className="u-footer">
            <span>
              UTM7 <i /> Uma visão clara do próximo passo.
            </span>
            <span>Dados reais. Decisões melhores.</span>
          </footer>
        </div>
      </main>
      <Dialog
        open={Boolean(bulk)}
        onOpenChange={(open) => {
          if (!open && !bulkBusy) setBulk(null);
        }}
      >
        <DialogContent
          data-u-theme={theme}
          className="u-dialog u-dialog-wide"
          onEscapeKeyDown={(e) => {
            if (bulkBusy) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (bulkBusy) e.preventDefault();
          }}
        >
          <DialogTitle>
            {bulk?.action === "budget"
              ? "Editar orçamento em massa"
              : bulk?.action === "ACTIVE"
                ? "Ativar itens selecionados"
                : "Pausar itens selecionados"}
          </DialogTitle>
          <DialogDescription>
            Confira os itens antes de confirmar. As alterações serão enviadas à conta Meta
            selecionada.
          </DialogDescription>
          {bulk && session && (
            <BulkEditor
              key={bulk.action + bulk.rows.map((r) => r.id).join(",")}
              batch={bulk}
              token={session.access_token}
              connectionId={connectionId}
              onBusy={setBulkBusy}
              onSettled={async () => {
                setSelected(new Set());
                await sync();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={colDialog} onOpenChange={setColDialog}>
        <DialogContent data-u-theme={theme} className="u-dialog">
          <DialogTitle>Suas colunas, do seu jeito</DialogTitle>
          <DialogDescription>
            Arraste para mudar a ordem ou use as setas. Marque as colunas que quer ver. O nome
            permanece fixo à esquerda.
          </DialogDescription>
          <ColumnEditor
            value={columnPrefs}
            onApply={(next) => {
              setColumnPrefs(next);
              try {
                localStorage.setItem("utm7:columns:v2", JSON.stringify(next));
              } catch {}
              setColDialog(false);
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(offerEdit)} onOpenChange={(open) => !open && setOfferEdit(null)}>
        <DialogContent data-u-theme={theme} className="u-dialog u-dialog-wide">
          <DialogTitle>{offerEdit?.id ? "Editar oferta" : "Nova oferta"}</DialogTitle>
          <DialogDescription>
            Associe o produto aos nomes recebidos no Sheets e aos IDs das campanhas.
          </DialogDescription>
          {offerEdit && (
            <OfferForm
              offer={offerEdit}
              saving={saving}
              onSave={async (p) => {
                if (await save("save_offer", p)) setOfferEdit(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(connEdit)} onOpenChange={(open) => !open && setConnEdit(null)}>
        <DialogContent data-u-theme={theme} className="u-dialog">
          <DialogTitle>{connEdit?.id ? "Editar conexão Meta" : "Conectar conta Meta"}</DialogTitle>
          <DialogDescription>
            Dados enviados pela sessão privada do M7. O token não é salvo no navegador.
          </DialogDescription>
          {connEdit && (
            <ConnectionForm
              connection={connEdit}
              saving={saving}
              onSave={async (p) => {
                if (await save("save_connection", p)) setConnEdit(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(budget)} onOpenChange={(open) => !open && !saving && setBudget(null)}>
        <DialogContent data-u-theme={theme} className="u-dialog">
          <DialogTitle>Alterar orçamento diário</DialogTitle>
          <DialogDescription>
            Esta ação altera o orçamento real na Meta. Confira o conjunto e o novo gasto diário
            antes de confirmar.
          </DialogDescription>
          {budget && (
            <BudgetForm
              row={budget}
              saving={saving}
              onSave={async (minor) => {
                const result = await save("prepare_budget", {
                  connection_id: connectionId,
                  adset_id: budget.id,
                  expected_budget_minor: budget.budgetMinor,
                  new_budget_minor: minor,
                  request_id: crypto.randomUUID(),
                  confirmed: true,
                });
                if (result) {
                  setBudget(null);
                  await sync();
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent data-u-theme={theme} className="u-dialog">
          <DialogTitle>Os números por trás do painel</DialogTitle>
          <DialogDescription>Fontes e critérios para comparar os resultados.</DialogDescription>
          <div className="u-help">
            <p>
              <strong>Compras e receita:</strong> pagamentos aprovados no Sheets, uma vez por
              pagamento. Eventos de teste são excluídos.
            </p>
            <p>
              <strong>IC:</strong> clique no botão da oferta, deduplicado por navegador/sessão e
              dia. Não é confirmação de pagamento.
            </p>
            <p>
              <strong>Visitas únicas:</strong> navegador identificado por oferta e dia. Sem ID
              persistente, a visita aparece apenas em PageViews brutos.
            </p>
            <p>
              <strong>ROAS:</strong> receita bruta ÷ investimento. <strong>ROI:</strong> lucro
              estimado ÷ investimento × 100.
            </p>
            <p>
              <strong>Lucro estimado:</strong> receita menos mídia, taxas, estornos e custo por
              venda cadastrado. Não inclui impostos ou despesas não informadas.
            </p>
            <p>
              <strong>Datas:</strong> Brasília no Sheets; mídia segue o fuso da conta Meta. Estornos
              entram na data da notificação. A atribuição por clique pode diferir da janela da Meta.
            </p>
            <p>
              <strong>Pixel:</strong> cadastro não instala código nem ativa CAPI de novas ofertas
              automaticamente.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BulkEditor({
  batch,
  token,
  connectionId,
  onBusy,
  onSettled,
}: {
  batch: {
    action: "budget" | "ACTIVE" | "PAUSED";
    rows: MetricRow[];
    level: Level;
    sourceCount: number;
  };
  token: string;
  connectionId: string;
  onBusy: (busy: boolean) => void;
  onSettled: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [phase, setPhase] = useState("");
  const validAmount = /^\d+(?:[.,]\d{1,2})?$/.test(amount);
  const minor = validAmount ? Math.round(Number(amount.replace(",", ".")) * 100) : 0;
  const valid = batch.action !== "budget" || (minor >= 100 && minor <= 1000000);
  const failures = results.filter((r) => !r.ok);
  const unit =
    batch.level === "ad" ? "anúncios" : batch.level === "adset" ? "conjuntos" : "campanhas";
  const execute = async (retry = false) => {
    if (!valid || busy) return;
    const items = retry
      ? batch.rows.filter((r) => failures.some((f) => f.id === r.id))
      : batch.rows;
    setBusy(true);
    onBusy(true);
    setPhase("Enviando alterações…");
    const previous = retry ? results.filter((r) => r.ok) : [];
    try {
      await runBulkOperations(
        items,
        (r) =>
          utm7Api(
            token,
            batch.action === "budget"
              ? {
                  action: "prepare_budget",
                  connection_id: connectionId,
                  adset_id: r.id,
                  expected_budget_minor: r.budgetMinor,
                  new_budget_minor: minor,
                  confirmed: true,
                  request_id: crypto.randomUUID(),
                }
              : {
                  action: "prepare_status",
                  connection_id: connectionId,
                  entity_id: r.id,
                  level: batch.level,
                  expected_status: r.status,
                  desired_status: batch.action,
                  confirmed: true,
                  request_id: crypto.randomUUID(),
                },
          ),
        (progress) => setResults([...previous, ...progress]),
      );
      setPhase("Atualizando os dados da Meta…");
      await onSettled();
      setPhase("Processamento concluído");
    } catch (e) {
      setPhase((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <div className="u-bulk-editor">
      <p className="u-note">
        {batch.rows.length} {unit} afetados
        {batch.action === "budget" && batch.sourceCount !== batch.rows.length
          ? ` pelos ${batch.sourceCount} anúncios selecionados`
          : ""}
        .{" "}
        {batch.action === "budget"
          ? "O valor será aplicado a cada conjunto; outros anúncios desses conjuntos compartilham o orçamento."
          : batch.action === "ACTIVE"
            ? batch.level === "ad"
              ? "A ativação não altera o orçamento dos itens."
              : "Ativar campanhas ou conjuntos pode liberar a veiculação dos anúncios dependentes já ativos. O orçamento permanece igual."
            : batch.level === "ad"
              ? "A pausa será aplicada somente aos anúncios listados."
              : "Pausar campanhas ou conjuntos também interrompe a veiculação dos anúncios dependentes."}
      </p>
      {batch.action === "budget" && (
        <label className="u-bulk-amount">
          Novo orçamento diário por conjunto (R$)
          <input
            inputMode="decimal"
            value={amount}
            disabled={busy || results.length > 0}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ex.: 20,00"
          />
          <small>
            Total diário selecionado:{" "}
            <strong>{valid ? money((minor / 100) * batch.rows.length) : "—"}</strong>
          </small>
        </label>
      )}
      <ul className="u-bulk-items">
        {batch.rows.map((r) => {
          const result = results.find((x) => x.id === r.id);
          return (
            <li key={r.id}>
              <div>
                <strong>{r.name}</strong>
                <small>
                  {r.id}
                  {batch.action === "budget"
                    ? ` · ${money((r.budgetMinor || 0) / 100)} → ${valid ? money(minor / 100) : "—"} /dia`
                    : ` · ${statusLabel(r.status)} → ${batch.action === "ACTIVE" ? "Ativar" : "Pausar"}`}
                </small>
                {result?.error && <p>{result.error}</p>}
              </div>
              <span className={result?.ok ? "u-positive" : result ? "u-negative" : "u-muted"}>
                {result ? (result.ok ? "Confirmado" : "Não confirmado") : "Aguardando"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="u-note" aria-live="polite">
        {phase || "Nenhuma alteração foi enviada."}
        {results.length > 0 &&
          ` · ${results.filter((r) => r.ok).length} confirmados · ${failures.length} não confirmados`}
      </p>
      {!results.length && (
        <button
          className="u-button u-primary u-full"
          disabled={!valid || busy}
          onClick={() => void execute()}
        >
          {busy
            ? "Enviando…"
            : `Confirmar ${batch.action === "budget" ? "orçamento" : batch.action === "ACTIVE" ? "ativação" : "pausa"} de ${batch.rows.length} ${unit}`}
        </button>
      )}
      {!busy && failures.length > 0 && (
        <button className="u-button u-full" onClick={() => void execute(true)}>
          Confirmar nova tentativa dos {failures.length} não confirmados
        </button>
      )}
    </div>
  );
}

function ColumnEditor({
  value,
  onApply,
}: {
  value: ColumnPreferences;
  onApply: (next: ColumnPreferences) => void;
}) {
  const [draft, setDraft] = useState(() => ({
    order: [...value.order],
    visible: [...value.visible],
  }));
  const [dragged, setDragged] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const move = (key: string, target: string) => {
    setDraft((prev) => ({ ...prev, order: moveColumn(prev.order, key, target) }));
    setAnnouncement(`${columns.find((c) => c.key === key)?.label} movida.`);
  };
  return (
    <>
      <div className="u-column-summary">
        <span>{draft.visible.length} colunas selecionadas</span>
        <button
          className="u-text-button"
          onClick={() =>
            setDraft(
              columnPreferences(
                null,
                columns.map((c) => c.key),
                defaultCols,
              ),
            )
          }
        >
          Restaurar padrão
        </button>
      </div>
      <ol className="u-column-list" aria-label="Ordem das colunas">
        {draft.order.map((key, index) => {
          const column = columns.find((c) => c.key === key)!;
          return (
            <li
              key={key}
              data-column={key}
              className={dragged === key ? "u-dragging" : ""}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                move(e.dataTransfer.getData("text/utm7-column"), key);
                setDragged("");
              }}
            >
              <button
                className="u-drag-handle"
                draggable
                aria-label={`Arrastar ${column.label}`}
                title="Arraste para reordenar"
                onDragStart={(e) => {
                  setDragged(key);
                  e.dataTransfer.setData("text/utm7-column", key);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDragged("")}
              >
                <GripVertical size={17} />
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={draft.visible.includes(key)}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      visible: e.target.checked
                        ? [...prev.visible, key]
                        : prev.visible.filter((k) => k !== key),
                    }))
                  }
                />
                <span>
                  {column.label}
                  {key === "budgetMinor" && <small>Somente em conjuntos</small>}
                </span>
              </label>
              <div className="u-column-arrows">
                <button
                  aria-label={`Mover ${column.label} para cima`}
                  disabled={index === 0}
                  onClick={() => move(key, draft.order[index - 1])}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  aria-label={`Mover ${column.label} para baixo`}
                  disabled={index === draft.order.length - 1}
                  onClick={() => move(key, draft.order[index + 1])}
                >
                  <ArrowDown size={15} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      <button className="u-button u-primary u-full" onClick={() => onApply(draft)}>
        Aplicar colunas
      </button>
    </>
  );
}

function statusLabel(status?: string) {
  return (
    (
      {
        ACTIVE: "Ativo",
        PAUSED: "Pausado",
        CAMPAIGN_PAUSED: "Campanha pausada",
        ADSET_PAUSED: "Conjunto pausado",
        PENDING_REVIEW: "Em análise",
        DISAPPROVED: "Reprovado",
        WITH_ISSUES: "Com problemas",
        ARCHIVED: "Arquivado",
        DELETED: "Excluído",
        IN_PROCESS: "Processando",
      } as Record<string, string>
    )[status || ""] || "Sem status"
  );
}
function Kpi({
  label,
  value,
  note,
  icon,
  accent = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <article className={`u-kpi u-kpi-${accent}`}>
      <div>
        <span>{label}</span>
        <i>{icon}</i>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function PanelTitle({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="u-panel-title">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="u-empty">
      <BarChart3 size={24} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
function MiniFunnel({ metrics: m, hasMeta }: { metrics: Metrics; hasMeta: boolean }) {
  const gradientId = useId().replace(/:/g, "");
  const rows = hasMeta
    ? [
        { label: "Cliques no link", value: m.clicks },
        { label: "Vis. página (Meta)", value: m.metaLpViews },
        { label: "Compras iniciadas", value: m.checkouts },
        { label: "Compras aprovadas", value: m.purchases },
      ]
    : [
        { label: "Visitas únicas/dia", value: m.visitors },
        { label: "Compras iniciadas", value: m.checkouts },
        { label: "Compras aprovadas", value: m.purchases },
      ];
  const graph = funnelGeometry(rows.map((r) => r.value));
  return (
    <figure className="u-graphic-funnel">
      <div
        className="u-horizontal-scroll"
        tabIndex={0}
        role="region"
        aria-label="Funil de conversão horizontal"
      >
        <div
          className="u-horizontal-funnel"
          style={{ "--u-stages": rows.length } as React.CSSProperties}
        >
          <div className="u-flow-plot">
            <svg
              viewBox={`0 0 ${graph.width} 240`}
              preserveAspectRatio="none"
              role="img"
              aria-label={rows
                .map((r, i) => `${r.label}: ${integer(r.value)}, ${pct(graph.percentages[i])}`)
                .join("; ")}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#185ee8" />
                  <stop offset=".35" stopColor="#6550dd" />
                  <stop offset=".7" stopColor="#8f3dd5" />
                  <stop offset=".82" stopColor="#167b70" />
                  <stop offset="1" stopColor="#167b70" />
                </linearGradient>
              </defs>
              <path d={graph.path} fill={`url(#${gradientId})`} />
            </svg>
            <div className="u-flow-rates" aria-hidden="true">
              {rows.map((r, i) => (
                <div key={r.label}>
                  <span className={graph.heights[i] < 20 ? "u-flow-small" : ""}>
                    {pct(graph.percentages[i])}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <ol className="u-flow-labels">
            {rows.map((r, i) => (
              <li key={r.label}>
                <strong>{integer(r.value)}</strong>
                <span>{r.label}</span>
                <small className="sr-only">{pct(graph.percentages[i])} da primeira etapa</small>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <figcaption>
        Percentuais sobre {hasMeta ? "os cliques" : "as visitas"}.{" "}
        {hasMeta
          ? "Cliques e visitas: Meta Ads · IC e pagamentos: rastreamento no Sheets."
          : "Visitas, IC e pagamentos registrados no Sheets."}
      </figcaption>
    </figure>
  );
}

function OfferForm({
  offer,
  saving,
  onSave,
}: {
  offer: Partial<UtmOffer>;
  saving: boolean;
  onSave: (p: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="u-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const list = (key: string) =>
          String(f.get(key) || "")
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        onSave({
          id: offer.id || "",
          name: f.get("name"),
          product_id: f.get("product_id"),
          pixel_id: f.get("pixel_id"),
          price: Number(f.get("price")),
          cost_per_sale: Number(f.get("cost_per_sale")),
          landing_url: f.get("landing_url"),
          checkout_url: f.get("checkout_url"),
          tracking_names: list("tracking_names"),
          campaign_ids: list("campaign_ids"),
          active: f.get("active") === "on",
        });
      }}
    >
      <label>
        Nome da oferta
        <input name="name" required maxLength={200} defaultValue={offer.name} />
      </label>
      <div className="u-form-row">
        <label>
          Preço de referência (R$)
          <input
            name="price"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={offer.price ?? 0}
          />
        </label>
        <label>
          Custo por venda (R$)
          <input
            name="cost_per_sale"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={offer.cost_per_sale ?? 0}
          />
        </label>
      </div>
      <div className="u-form-row">
        <label>
          ID do produto
          <input name="product_id" defaultValue={offer.product_id} />
        </label>
        <label>
          ID do pixel Meta
          <input
            name="pixel_id"
            inputMode="numeric"
            pattern="[0-9]*"
            defaultValue={offer.pixel_id}
          />
        </label>
      </div>
      <label>
        Landing page
        <input
          name="landing_url"
          type="url"
          pattern="https://.*"
          defaultValue={offer.landing_url}
        />
      </label>
      <label>
        Checkout
        <input
          name="checkout_url"
          type="url"
          pattern="https://.*"
          defaultValue={offer.checkout_url}
        />
      </label>
      <label>
        Nomes exatos recebidos no Sheets
        <textarea
          name="tracking_names"
          defaultValue={offer.tracking_names?.join("\n")}
          placeholder="Um nome por linha. Inclua o nome do produto nas vendas."
        />
      </label>
      <label>
        IDs das campanhas
        <textarea
          name="campaign_ids"
          defaultValue={offer.campaign_ids?.join("\n")}
          placeholder="Um ID por linha. Também identificamos campanhas pelas UTMs da LP."
        />
      </label>
      <label className="u-check-label">
        <input name="active" type="checkbox" defaultChecked={offer.active ?? true} />
        Oferta ativa
      </label>
      <button className="u-button u-primary" disabled={saving}>
        {saving ? "Salvando…" : "Salvar oferta"}
      </button>
    </form>
  );
}
function ConnectionForm({
  connection: c,
  saving,
  onSave,
}: {
  connection: Partial<UtmConnection>;
  saving: boolean;
  onSave: (p: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="u-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave({
          id: c.id || "",
          name: f.get("name"),
          account_id: String(f.get("account_id")).replace(/^act_/, ""),
          access_token: String(f.get("access_token") || "").trim(),
        });
      }}
    >
      <label>
        Nome da conexão
        <input name="name" defaultValue={c.name} required maxLength={150} />
      </label>
      <label>
        ID da conta de anúncios
        <input
          name="account_id"
          defaultValue={c.account_id}
          required
          placeholder="123456789 ou act_123456789"
          pattern="(act_)?[0-9]{5,30}"
        />
      </label>
      <label>
        Token da Marketing API
        <input
          type="password"
          name="access_token"
          autoComplete="new-password"
          required={!c.id}
          placeholder={c.id ? "Deixe vazio para manter o atual" : "Token com acesso à conta Meta"}
        />
      </label>
      <p className="u-note">
        Conta em BRL. O token de CAPI do pixel pode não ter permissão para consultar anúncios.
      </p>
      <button className="u-button u-primary" disabled={saving}>
        {saving ? "Salvando…" : "Salvar conexão"}
      </button>
    </form>
  );
}
function BudgetForm({
  row,
  saving,
  onSave,
}: {
  row: MetricRow;
  saving: boolean;
  onSave: (minor: number) => void;
}) {
  const [value, setValue] = useState(String(Number(row.budgetMinor) / 100));
  const minor = Math.round(Number(value) * 100);
  return (
    <form
      className="u-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (Number.isInteger(minor) && minor >= 100) onSave(minor);
      }}
    >
      <div className="u-budget-summary">
        <strong>{row.name}</strong>
        <small>ID {row.id}</small>
        <span>Atual: {money(Number(row.budgetMinor) / 100)}/dia</span>
      </div>
      <label>
        Novo orçamento por dia (R$)
        <input
          type="number"
          min="1"
          max="10000"
          step="0.01"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <p className="u-note">
        Novo limite do conjunto: <strong>{money(Number(value))}/dia</strong>. A API confere o valor
        atual antes de aplicar. O status da campanha não será alterado.
      </p>
      <button className="u-button u-primary" disabled={saving || minor === row.budgetMinor}>
        {saving ? "Confirmando na Meta…" : "Confirmar alteração na Meta"}
      </button>
    </form>
  );
}
