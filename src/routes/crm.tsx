import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AtSign,
  Building2,
  CalendarClock,
  Clipboard,
  Columns3,
  ExternalLink,
  Flame,
  MapPinCheck,
  Home,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Star,
  TrendingUp,
  UserCheck,
  UserRound,
  X,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAppSidebar } from "@/hooks/use-app-sidebar";
import { useAppAccess } from "@/hooks/use-access";
import { supabase } from "@/integrations/supabase/client";
import {
  MATERIAL_FORMAT_BADGE_STYLES,
  MATERIAL_FORMAT_LABELS,
  normalizeMaterialFormat,
  readFavoriteMaterialIds,
} from "@/lib/crm-materials";

type Lead = Tables<"crm_leads">;
type Activity = Tables<"crm_activities">;
type Material = Tables<"crm_materials">;
type Stage = Lead["stage"];

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return fallback;
}
type WebsiteFilter = "all" | "with" | "without";

const CRM_API_URL = "https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-crm/api";
const CRM_WHATSAPP_URL = "https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-crm/whatsapp";

async function crmApi<T>(token: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(CRM_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    cache: "no-store",
    body: JSON.stringify({ token, ...payload }),
  });
  if (!response.ok) throw new Error(`CRM indisponível (${response.status})`);
  const result = (await response.json()) as { ok?: boolean; data?: T; error?: string };
  if (!result.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
  return result.data as T;
}

async function sendLeadToGroup(token: string, leadId: string): Promise<void> {
  const response = await fetch(CRM_WHATSAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ token, leadId }),
  });
  const rawResult = await response.text();
  let result: { ok?: boolean; error?: string; message?: string } = {};
  try {
    result = JSON.parse(rawResult) as typeof result;
  } catch {
    // O n8n pode responder texto puro quando um node falha antes do Respond to Webhook.
  }
  if (!response.ok || !result.ok) {
    const detail = result.error || result.message || rawResult.trim();
    throw new Error(detail || `WhatsApp indisponível (${response.status})`);
  }
}

const stages: { id: Stage; label: string; color: string }[] = [
  { id: "novo", label: "Novo lead", color: "bg-sky-400" },
  { id: "primeiro_contato", label: "Primeiro contato", color: "bg-blue-500" },
  { id: "respondeu", label: "Em conversa", color: "bg-cyan-400" },
  { id: "follow_up", label: "Follow-Up", color: "bg-violet-400" },
  { id: "reuniao", label: "Reunião", color: "bg-amber-400" },
  { id: "proposta", label: "Proposta", color: "bg-orange-400" },
  { id: "cliente", label: "Cliente", color: "bg-emerald-400" },
  { id: "perdido", label: "Perdido", color: "bg-zinc-500" },
  { id: "fora_do_perfil", label: "Fora do perfil", color: "bg-rose-400" },
];

type PipelineColumn = {
  key: string;
  stage: Stage;
  label: string;
  color: string;
  sourceGroup?: "maps" | "cnpj";
};

const pipelineColumns: PipelineColumn[] = [
  {
    key: "novo-maps",
    stage: "novo",
    label: "Novo lead · Maps",
    color: "bg-blue-500",
    sourceGroup: "maps",
  },
  {
    key: "novo-cnpj",
    stage: "novo",
    label: "Novo lead · CNPJ",
    color: "bg-fuchsia-500",
    sourceGroup: "cnpj",
  },
  ...stages
    .filter((stage) => stage.id !== "novo")
    .map((stage) => ({ key: stage.id, stage: stage.id, label: stage.label, color: stage.color })),
];

const sourceStyle: Record<string, string> = {
  Maps: "border-l-blue-500",
  CNPJ: "border-l-fuchsia-500",
  "Maps + CNPJ": "border-l-violet-500",
};

const siteQualityBadge = {
  none: { label: "Sem site", className: "border-zinc-600 bg-zinc-800 text-zinc-300" },
  bad: { label: "Site ruim", className: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
  good: {
    label: "Site bom",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
} as const;

const paidTrafficBadge = {
  yes: {
    label: "Faz tráfego pago",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  no: {
    label: "Sem tráfego pago",
    className: "border-zinc-600 bg-zinc-800 text-zinc-300",
  },
} as const;

const instagramQualityBadge = {
  none: {
    label: "Sem Instagram",
    className: "border-zinc-600 bg-zinc-800 text-zinc-300",
  },
  bad: {
    label: "Instagram ruim",
    className: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  },
  good: {
    label: "Instagram bom",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
} as const;

const radarPoints = {
  site: { none: 35, bad: 22, good: 7 },
  instagram: { none: 20, bad: 12, good: 5 },
  traffic: { no: 25, yes: 12 },
} as const;

function radarM7(lead: Partial<Lead>) {
  const site = lead.site_quality as keyof typeof radarPoints.site | null | undefined;
  const instagram = lead.instagram_quality as keyof typeof radarPoints.instagram | null | undefined;
  const traffic = lead.paid_traffic_status as keyof typeof radarPoints.traffic | null | undefined;
  if (!site || !instagram || !traffic) return null;
  if (!(site in radarPoints.site) || !(instagram in radarPoints.instagram)) return null;
  if (!(traffic in radarPoints.traffic)) return null;
  const manual =
    20 + radarPoints.site[site] + radarPoints.instagram[instagram] + radarPoints.traffic[traffic];
  const legacyScore = Math.min(10, Math.max(0, Number(lead.score) || 0));
  return {
    total: Math.round(manual * 0.8 + legacyScore * 2),
    manual,
    legacyScore,
    site: radarPoints.site[site],
    instagram: radarPoints.instagram[instagram],
    traffic: radarPoints.traffic[traffic],
  };
}

function suggestedService(lead: Partial<Lead>) {
  const site = lead.site_quality;
  const traffic = lead.paid_traffic_status;
  const score = Math.min(10, Math.max(0, Number(lead.score) || 0));
  const radar = radarM7(lead);
  const context = [
    score >= 8 ? `Nota ${score.toFixed(1)} indica uma boa base para a abordagem.` : "",
    radar && radar.total >= 70 ? `Radar M7 ${radar.total} mostra várias oportunidades.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (site === "none") {
    return {
      label: "Site",
      className: "border-sky-500/40 bg-sky-500/10 text-sky-300",
      reason: `Sem site confirmado. É a oferta mais rápida e simples para estruturar a presença digital.${context ? ` ${context}` : ""}`,
    };
  }
  if (site === "bad") {
    return {
      label: "Site",
      className: "border-sky-500/40 bg-sky-500/10 text-sky-300",
      reason: `O site atual foi avaliado como ruim. A primeira oferta deve ser uma reformulação mais profissional e voltada à conversão.${context ? ` ${context}` : ""}`,
    };
  }
  if (site === "good" && traffic === "no") {
    return {
      label: "Tráfego pago",
      className: "border-violet-500/40 bg-violet-500/10 text-violet-300",
      reason: `O site já está preparado, mas a empresa não faz tráfego pago. A oportunidade é gerar demanda e levar mais pessoas para essa estrutura.${context ? ` ${context}` : ""}`,
    };
  }
  if (site === "good" && traffic === "yes") {
    return {
      label: "Automação",
      className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
      reason: `A empresa já possui site bom e tráfego ativo. A melhor abertura é automação de atendimento, processos ou qualificação de contatos.${context ? ` ${context}` : ""}`,
    };
  }
  return null;
}

export const Route = createFileRoute("/crm")({ component: CrmComponent });

function money(value: number | null) {
  if (value == null) return "Não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function when(value: string | null) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}

function hasOwnWebsite(value: string | null) {
  if (!value?.trim()) return false;
  return !/(instagram\.com|facebook\.com|fb\.com|linktr\.ee|bit\.ly|wa\.me|whatsapp\.com|tiktok\.com|maps\.app\.goo\.gl|google\.com\/maps)/i.test(
    value,
  );
}

function hasAssignment(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return (
    !!normalized &&
    !["null", "undefined", "none", "unassigned", "não atribuído", "nao atribuido"].includes(
      normalized,
    )
  );
}

function isUnassigned(lead: Lead) {
  return !hasAssignment(lead.assigned_to) && !hasAssignment(lead.assigned_to_name);
}

function formatPhone(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  const national = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (national.length === 11) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  }
  if (national.length === 10) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  }
  return value?.replace(/@s\.whatsapp\.net$/i, "") || "Telefone não informado";
}

function cnpjCompanyName(lead: Lead) {
  const refs = lead.source_refs as Record<string, unknown> | null;
  const candidates = [
    refs?.razao_social,
    refs?.razaoSocial,
    refs?.nome_empresarial,
    refs?.legal_name,
    lead.company_name,
  ];
  return candidates.find((value): value is string => typeof value === "string" && !!value.trim());
}

function googleMapsUrl(lead: Lead) {
  const location = lead.address || [lead.city, lead.state].filter(Boolean).join(" - ");
  const company = lead.source === "Maps" ? lead.company_name : cnpjCompanyName(lead);
  const query = [company, location].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function instagramUrl(value: string | null | undefined) {
  const clean = value?.trim();
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  if (/^(www\.)?instagram\.com\//i.test(clean)) return `https://${clean}`;
  return `https://www.instagram.com/${clean.replace(/^@/, "").replace(/^\/+|\/+$/g, "")}`;
}

function instagramHandle(value: string | null | undefined) {
  const clean = value?.trim();
  if (!clean) return "";
  try {
    const parsed = new URL(instagramUrl(clean));
    return parsed.pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "") ?? "";
  } catch {
    return clean.replace(/^@/, "").split(/[/?#]/)[0];
  }
}

function metaAdsLibraryUrl(value: string | null | undefined, companyName: string) {
  const query = instagramHandle(value) || companyName.trim();
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: "BR",
    media_type: "all",
    q: query,
    search_type: "keyword_unordered",
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

function instagramSearchUrl(lead: Lead) {
  const query = `${lead.company_name} Instagram`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function facebookUrl(value: string | null | undefined) {
  const clean = value?.trim();
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  if (/^(www\.)?(facebook|fb)\.com\//i.test(clean)) return `https://${clean}`;
  return `https://www.facebook.com/${clean.replace(/^@/, "").replace(/^\/+|\/+$/g, "")}`;
}

function facebookPageQuery(value: string | null | undefined, companyName: string) {
  const clean = value?.trim();
  if (!clean) return companyName.trim();
  try {
    const parsed = new URL(facebookUrl(clean));
    const segments = parsed.pathname.split("/").filter(Boolean);
    const candidate = segments.find(
      (segment) => !["pages", "pg", "profile.php"].includes(segment.toLowerCase()),
    );
    return candidate
      ? decodeURIComponent(candidate)
          .replace(/[-_.]+/g, " ")
          .trim()
      : companyName.trim();
  } catch {
    return (
      clean
        .replace(/^@/, "")
        .replace(/[-_.]+/g, " ")
        .trim() || companyName.trim()
    );
  }
}

function facebookSearchUrl(lead: Lead) {
  const query = `${lead.company_name} Facebook`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function facebookAdsLibraryUrl(value: string | null | undefined, companyName: string) {
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: "BR",
    media_type: "all",
    q: facebookPageQuery(value, companyName),
    search_type: "keyword_unordered",
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

function CrmComponent() {
  const sidebar = useAppSidebar();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("Todos");
  const [assignee, setAssignee] = useState("all");
  const [websiteFilter, setWebsiteFilter] = useState<WebsiteFilter>("all");
  const [selected, setSelected] = useState<Lead | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, session, loading, signOut } = useAuth();
  const access = useAppAccess();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", search: {} as never });
  }, [loading, session, navigate]);
  useEffect(() => {
    if (!access.loading && session && !access.can("crm")) {
      window.location.href = access.firstAllowedPath;
    }
  }, [access, session]);

  const leadsQuery = useQuery({
    queryKey: ["crm-leads"],
    enabled: !!session,
    queryFn: () => crmApi<Lead[]>(session!.access_token, { action: "list" }),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel(`crm-leads-${user?.id ?? "user"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_leads" }, (payload) => {
        queryClient.setQueryData<Lead[]>(["crm-leads"], (current) => {
          if (!current) return current;

          if (payload.eventType === "DELETE") {
            const removedId = (payload.old as { id?: string }).id;
            return removedId ? current.filter((lead) => lead.id !== removedId) : current;
          }

          const changedLead = payload.new as Lead;
          const existingIndex = current.findIndex((lead) => lead.id === changedLead.id);
          if (existingIndex === -1) return [changedLead, ...current];

          const next = [...current];
          next[existingIndex] = changedLead;
          return next;
        });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, session, user?.id]);

  useEffect(() => {
    if (!selected || !leadsQuery.data) return;
    const freshLead = leadsQuery.data.find((lead) => lead.id === selected.id);
    if (
      freshLead &&
      (freshLead.assigned_to !== selected.assigned_to ||
        freshLead.assigned_to_name !== selected.assigned_to_name ||
        freshLead.stage !== selected.stage ||
        freshLead.facebook_url !== selected.facebook_url ||
        freshLead.site_quality !== selected.site_quality ||
        freshLead.instagram_quality !== selected.instagram_quality ||
        freshLead.paid_traffic_status !== selected.paid_traffic_status)
    ) {
      setSelected(freshLead);
    }
  }, [leadsQuery.data, selected]);

  const updateLead = useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: Partial<Lead> }) => {
      return crmApi<Lead>(session!.access_token, { action: "update", leadId: id, changes });
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      setSelected((current) => (current?.id === lead.id ? lead : current));
    },
    onError: () => toast.error("Não foi possível salvar a alteração."),
  });

  const assignLead = useMutation({
    mutationFn: async ({ id, mode }: { id: string; mode: "claim" | "release" | "takeover" }) => {
      if (mode !== "claim") {
        return crmApi<Lead>(session!.access_token, {
          action: "assign",
          leadId: id,
          assignmentMode: mode,
        });
      }

      const { data, error } = await supabase.rpc("claim_crm_lead", { p_lead_id: id });
      if (error) throw error;
      return data as Lead;
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      setSelected((current) => (current?.id === lead.id ? lead : current));
      toast.success(
        lead.assigned_to_name ? `Lead atribuído a ${lead.assigned_to_name}.` : "Lead liberado.",
      );
    },
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      toast.error(errorMessage(error, "Não foi possível alterar o responsável."));
    },
  });

  const syncLeads = useMutation({
    mutationFn: async () => {
      return crmApi<undefined>(session!.access_token, {
        action: "command",
        commandType: "sync",
      });
    },
    onSuccess: () =>
      toast.success("Sincronização solicitada. Os cards serão atualizados em até um minuto."),
    onError: () => toast.error("A sincronização com as planilhas falhou."),
  });

  const sendLead = useMutation({
    mutationFn: async (lead: Lead) => {
      return sendLeadToGroup(session!.access_token, lead.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      toast.success("Lead enviado pela Ester para o seu destino cadastrado.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível enviar o lead pelo WhatsApp.",
      ),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (leadsQuery.data ?? []).filter((lead) => {
      const matchesSource = source === "Todos" || lead.source === source;
      const isNamedAssignee = !["all", "mine", "unassigned"].includes(assignee);
      const leadIsUnassigned = isUnassigned(lead);
      const matchesAssignee =
        assignee === "all" ||
        (assignee === "mine" && lead.assigned_to === user?.id) ||
        (assignee === "unassigned" && leadIsUnassigned) ||
        (isNamedAssignee &&
          (leadIsUnassigned ||
            lead.assigned_to === assignee ||
            lead.assigned_to_name === assignee));
      const leadHasWebsite = hasOwnWebsite(lead.website);
      const matchesWebsite =
        websiteFilter === "all" ||
        (websiteFilter === "with" && leadHasWebsite) ||
        (websiteFilter === "without" && !leadHasWebsite);
      const matchesText =
        !needle ||
        [lead.company_name, lead.partner_name, lead.city, lead.phone, lead.cnpj].some((value) =>
          value?.toLowerCase().includes(needle),
        );
      return matchesSource && matchesAssignee && matchesWebsite && matchesText;
    });
  }, [leadsQuery.data, search, source, assignee, websiteFilter, user?.id]);

  const assignees = useMemo(() => {
    const people = new Map<string, string>();
    for (const lead of leadsQuery.data ?? []) {
      if (lead.assigned_to && lead.assigned_to_name) {
        people.set(lead.assigned_to, lead.assigned_to_name);
      }
    }
    return [...people.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [leadsQuery.data]);

  if (loading || access.loading || !session || !access.can("crm"))
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-white">
      <AppSidebar active="crm" {...sidebar} />

      <main
        className={`flex h-full min-w-0 flex-1 flex-col transition-[padding] duration-200 ${sidebar.collapsed ? "lg:pl-20" : "lg:pl-64"}`}
      >
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-950/90 px-4 backdrop-blur md:px-6">
          <button onClick={() => sidebar.setMobileOpen(true)} className="lg:hidden">
            <Menu className="h-6 w-6 text-zinc-400" />
          </button>
          <div>
            <h1 className="font-bold">CRM M7</h1>
            <p className="hidden text-xs text-zinc-500 sm:block">
              Leads qualificados do Maps e CNPJ
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-zinc-500 md:block">{user?.email}</span>
            <button
              onClick={() => signOut()}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 lg:p-7">
          <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Pipeline comercial</h2>
              <p className="text-sm text-zinc-400">Arraste um card para atualizar sua etapa.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-64 flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Empresa, sócio, cidade, telefone..."
                  className="border-zinc-700 bg-zinc-900 pl-9"
                />
              </div>
              {["Todos", "Maps", "CNPJ", "Maps + CNPJ"].map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={source === item ? "default" : "outline"}
                  onClick={() => setSource(item)}
                  className={
                    source === item ? "bg-blue-600" : "border-zinc-700 bg-zinc-900 text-zinc-300"
                  }
                >
                  {item}
                </Button>
              ))}
              <select
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
                aria-label="Filtrar por responsável"
                className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-300"
              >
                <option value="all">Todos os responsáveis</option>
                <option value="mine">Meus leads</option>
                <option value="unassigned">Não atribuídos</option>
                {assignees.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name} + não atribuídos
                  </option>
                ))}
              </select>
              <select
                value={websiteFilter}
                onChange={(event) => setWebsiteFilter(event.target.value as WebsiteFilter)}
                aria-label="Filtrar por presença de site"
                className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-300"
              >
                <option value="all">Todos os sites</option>
                <option value="with">Com site</option>
                <option value="without">Sem site</option>
              </select>
              <Button
                onClick={() => syncLeads.mutate()}
                disabled={syncLeads.isPending}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${syncLeads.isPending ? "animate-spin" : ""}`}
                />
                Sincronizar leads
              </Button>
            </div>
          </div>

          {leadsQuery.isLoading ? (
            <div className="flex h-80 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : leadsQuery.error ? (
            <div className="rounded-xl border border-red-900 bg-red-950/30 p-8 text-center text-red-300">
              Não foi possível carregar o CRM. Confirme se a migração do banco foi publicada.
            </div>
          ) : (
            <div className="grid min-w-[2360px] grid-cols-9 gap-3 pb-4">
              {pipelineColumns.map((column) => {
                const stageLeads = filtered
                  .filter((lead) => {
                    if (lead.stage !== column.stage) return false;
                    if (column.sourceGroup === "maps") {
                      return lead.source === "Maps" || lead.source === "Maps + CNPJ";
                    }
                    if (column.sourceGroup === "cnpj") return lead.source === "CNPJ";
                    return true;
                  })
                  .sort((a, b) => {
                    const touchedDifference =
                      new Date(b.last_touched_at ?? b.created_at).getTime() -
                      new Date(a.last_touched_at ?? a.created_at).getTime();
                    if (touchedDifference !== 0) return touchedDifference;

                    const scoreDifference = Number(b.score) - Number(a.score);
                    if (scoreDifference !== 0) return scoreDifference;

                    const createdDifference =
                      new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                    if (createdDifference !== 0) return createdDifference;

                    return a.id.localeCompare(b.id);
                  });
                return (
                  <section
                    key={column.key}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData("text/lead-id");
                      if (id) updateLead.mutate({ id, changes: { stage: column.stage } });
                    }}
                    className="min-h-[68vh] rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${column.color}`} />
                      <h3 className="font-semibold">{column.label}</h3>
                      <span className="ml-auto rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                        {stageLeads.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {stageLeads.map((lead) => (
                        <LeadCard key={lead.id} lead={lead} onOpen={() => setSelected(lead)} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <LeadDialog
        lead={selected}
        onClose={() => setSelected(null)}
        onSave={(changes) => selected && updateLead.mutate({ id: selected.id, changes })}
        onSend={() => selected && sendLead.mutate(selected)}
        saving={updateLead.isPending}
        sending={sendLead.isPending}
        assigning={assignLead.isPending}
        currentUserId={user?.id ?? ""}
        isAdmin={Boolean(access.profile?.is_admin)}
        onAssign={(mode) => selected && assignLead.mutate({ id: selected.id, mode })}
        accessToken={session.access_token}
      />
    </div>
  );
}

function Nav({
  href,
  icon,
  label,
  active = false,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-3 rounded-lg px-4 py-3 ${active ? "bg-blue-600 font-medium text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
    >
      <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      {label}
    </a>
  );
}

function LeadCard({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  const mapsOnly = lead.source === "Maps";
  const ownWebsite = hasOwnWebsite(lead.website);
  const confirmedSite =
    lead.site_quality && lead.site_quality in siteQualityBadge
      ? siteQualityBadge[lead.site_quality as keyof typeof siteQualityBadge]
      : null;
  const confirmedTraffic =
    lead.paid_traffic_status && lead.paid_traffic_status in paidTrafficBadge
      ? paidTrafficBadge[lead.paid_traffic_status as keyof typeof paidTrafficBadge]
      : null;
  const confirmedInstagram =
    lead.instagram_quality && lead.instagram_quality in instagramQualityBadge
      ? instagramQualityBadge[lead.instagram_quality as keyof typeof instagramQualityBadge]
      : null;
  const radar = radarM7(lead);
  const service = suggestedService(lead);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/lead-id", lead.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className={`w-full cursor-grab rounded-lg border border-l-4 border-zinc-700 bg-zinc-950 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-600 ${sourceStyle[lead.source] ?? "border-l-zinc-500"}`}
    >
      <div className="flex items-start gap-2">
        <p className="line-clamp-2 flex-1 text-sm font-semibold">{lead.company_name}</p>
        {lead.instagram_url && (
          <span title="Instagram encontrado" className="mt-1 text-pink-300">
            <AtSign className="h-4 w-4" />
          </span>
        )}
        {lead.address_verified && (
          <span title="Endereço verificado" className="mt-1 text-emerald-300">
            <MapPinCheck className="h-4 w-4" />
          </span>
        )}
        {radar && (
          <span
            title="Radar M7: possibilidades de solução, não prioridade nem chance de fechamento"
            className="inline-flex items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/15 px-2 py-1 text-xs font-bold text-orange-300"
          >
            <Flame className="h-3.5 w-3.5" />
            {radar.total}
          </span>
        )}
        <span className="rounded-md bg-blue-500/15 px-2 py-1 text-xs font-bold text-blue-300">
          {Number(lead.score).toFixed(1)}
        </span>
      </div>
      {mapsOnly ? (
        <div className="mt-2 space-y-1.5 text-xs">
          <div
            className={`flex items-center gap-1.5 ${ownWebsite ? "text-emerald-300" : "text-amber-300"}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>{ownWebsite ? "Com site" : "Sem site"}</span>
          </div>
          <p className="text-zinc-400">
            Nota {lead.maps_rating ?? "-"} · {lead.maps_reviews ?? 0}{" "}
            {lead.maps_reviews === 1 ? "avaliação" : "avaliações"}
          </p>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
          <UserRound className="h-3.5 w-3.5" />
          <span className="truncate">{lead.partner_name || "Sócio não informado"}</span>
        </div>
      )}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-300">
        <Phone className="h-3.5 w-3.5 text-zinc-500" />
        <span>{formatPhone(lead.phone)}</span>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
        <span className="truncate">{lead.source}</span>
        <span className="truncate text-right">{lead.city || "Cidade não informada"}</span>
      </div>
      {!mapsOnly && (
        <p className="mt-2 text-xs font-medium text-zinc-300">{money(lead.capital_social)}</p>
      )}
      {(confirmedSite || confirmedInstagram || confirmedTraffic) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {confirmedSite && (
            <span
              className={`rounded-md border px-2 py-1 text-[10px] font-medium ${confirmedSite.className}`}
            >
              {confirmedSite.label}
            </span>
          )}
          {confirmedInstagram && (
            <span
              className={`rounded-md border px-2 py-1 text-[10px] font-medium ${confirmedInstagram.className}`}
            >
              {confirmedInstagram.label}
            </span>
          )}
          {confirmedTraffic && (
            <span
              className={`rounded-md border px-2 py-1 text-[10px] font-medium ${confirmedTraffic.className}`}
            >
              {confirmedTraffic.label}
            </span>
          )}
        </div>
      )}
      {service && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1.5 text-[10px]">
          <span className="text-zinc-500">Serviço sugerido</span>
          <span className={`rounded border px-1.5 py-0.5 font-semibold ${service.className}`}>
            {service.label}
          </span>
        </div>
      )}
      {lead.next_action_at && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-300">
          <CalendarClock className="h-3 w-3" />
          {when(lead.next_action_at)}
        </p>
      )}
      {lead.assigned_to_name && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-violet-300">
          <UserCheck className="h-3.5 w-3.5" />
          {lead.assigned_to_name}
        </p>
      )}
    </div>
  );
}

function LeadDialog({
  lead,
  onClose,
  onSave,
  onSend,
  saving,
  sending,
  assigning,
  currentUserId,
  isAdmin,
  onAssign,
  accessToken,
}: {
  lead: Lead | null;
  onClose: () => void;
  onSave: (changes: Partial<Lead>) => void;
  onSend: () => void;
  saving: boolean;
  sending: boolean;
  assigning: boolean;
  currentUserId: string;
  isAdmin: boolean;
  onAssign: (mode: "claim" | "release" | "takeover") => void;
  accessToken: string;
}) {
  const [draft, setDraft] = useState<Partial<Lead>>({});
  const [activities, setActivities] = useState<Activity[]>([]);
  const [favoriteMaterialIds, setFavoriteMaterialIds] = useState<string[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const materialsQuery = useQuery({
    queryKey: ["crm-materials"],
    queryFn: () => crmApi<Material[]>(accessToken, { action: "material-list" }),
    enabled: Boolean(lead),
    staleTime: 10_000,
  });
  useEffect(() => {
    setDraft(lead ?? {});
    setSelectedMaterial(null);
    setFavoriteMaterialIds(readFavoriteMaterialIds(currentUserId));
    if (!lead) return;
    void crmApi<Activity[]>(accessToken, { action: "activities", leadId: lead.id })
      .then((data) => setActivities(data ?? []))
      .catch(() => setActivities([]));
  }, [lead, accessToken, currentUserId]);
  const favoriteMaterials = useMemo(() => {
    const favorites = new Set(favoriteMaterialIds);
    return (materialsQuery.data ?? [])
      .filter((material) => favorites.has(material.id))
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }, [favoriteMaterialIds, materialsQuery.data]);
  const field = (key: keyof Lead, value: unknown) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const radar = radarM7(draft);
  const service = suggestedService(draft);
  return (
    <Dialog open={!!lead} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={`max-h-[92vh] overflow-y-auto border-zinc-700 bg-zinc-900 text-white ${
          selectedMaterial ? "sm:max-w-6xl" : "sm:max-w-3xl"
        }`}
      >
        {lead && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 pr-8 text-xl">
                {lead.company_name}
                <span className="rounded-lg bg-blue-500/15 px-2.5 py-1 text-sm text-blue-300">
                  Nota {Number(lead.score).toFixed(1)}
                </span>
                {radar && (
                  <span
                    title="Possibilidades de solução; não representa prioridade nem chance de fechamento."
                    className="inline-flex items-center gap-1 rounded-lg border border-orange-500/30 bg-orange-500/15 px-2.5 py-1 text-sm text-orange-300"
                  >
                    <Flame className="h-4 w-4" /> Radar M7 {radar.total}
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="text-zinc-400">
                {lead.source} · {lead.city || "Cidade não informada"}
                {lead.state ? `/${lead.state}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div
              className={
                selectedMaterial
                  ? "grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,1.25fr)]"
                  : ""
              }
            >
              <div className="min-w-0 space-y-4">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-4">
                    {lead.source !== "Maps" && (
                      <Info
                        icon={<UserRound />}
                        label="Sócio / responsável"
                        value={lead.partner_name || "Não informado"}
                      />
                    )}
                    <Info
                      icon={<Phone />}
                      label="Telefone / WhatsApp"
                      value={lead.phone || "Não informado"}
                    />
                    {lead.source !== "Maps" && (
                      <Info icon={<Mail />} label="E-mail" value={lead.email || "Não informado"} />
                    )}
                    {lead.source !== "Maps" && (
                      <Info
                        icon={<Building2 />}
                        label="Capital social"
                        value={money(lead.capital_social)}
                      />
                    )}
                    {lead.source === "Maps" && (
                      <p
                        className={`rounded-lg p-3 text-sm ${hasOwnWebsite(lead.website) ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200"}`}
                      >
                        {hasOwnWebsite(lead.website)
                          ? "Possui site próprio"
                          : "Não possui site próprio"}
                      </p>
                    )}
                    {lead.address && (
                      <Info icon={<Building2 />} label="Endereço" value={lead.address} />
                    )}
                    {lead.source !== "Maps" && (
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm transition hover:border-emerald-500/60">
                        <input
                          type="checkbox"
                          checked={Boolean(draft.address_verified)}
                          onChange={(event) => field("address_verified", event.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-emerald-500"
                        />
                        <MapPinCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                        <span>
                          <span className="block font-medium text-zinc-200">
                            Empresa confirmada neste endereço
                          </span>
                          <span className="mt-1 block text-xs text-zinc-500">
                            Marque após confirmar pelo Google Maps ou outra fonte.
                          </span>
                        </span>
                      </label>
                    )}
                    {(lead.website || lead.source) && (
                      <div className="flex flex-wrap gap-2">
                        {lead.website && (
                          <a
                            href={
                              lead.website.startsWith("http")
                                ? lead.website
                                : `https://${lead.website}`
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-blue-300 hover:border-zinc-600 hover:bg-zinc-700"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Abrir site
                          </a>
                        )}
                        {lead.source === "Maps" || lead.source === "Maps + CNPJ" ? (
                          <a
                            href={googleMapsUrl(lead)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-blue-300 hover:border-zinc-600 hover:bg-zinc-700"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Abrir no Maps
                          </a>
                        ) : (
                          <a
                            href={googleMapsUrl(lead)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-blue-300 hover:border-zinc-600 hover:bg-zinc-700"
                          >
                            <Search className="h-4 w-4" />
                            Verificar no Maps
                          </a>
                        )}
                        {String(draft.instagram_url ?? "").trim() && (
                          <>
                            <a
                              href={instagramUrl(String(draft.instagram_url))}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-pink-300 hover:border-pink-500/50 hover:bg-zinc-700"
                            >
                              <AtSign className="h-4 w-4" />
                              Abrir Instagram
                            </a>
                            <a
                              href={metaAdsLibraryUrl(
                                String(draft.instagram_url),
                                lead.company_name,
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-amber-300 hover:border-amber-500/50 hover:bg-zinc-700"
                            >
                              <TrendingUp className="h-4 w-4" />
                              Ver anúncios
                            </a>
                          </>
                        )}
                        {!String(draft.instagram_url ?? "").trim() && (
                          <a
                            href={instagramSearchUrl(lead)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-pink-300 hover:border-pink-500/50 hover:bg-zinc-700"
                          >
                            <Search className="h-4 w-4" />
                            Buscar Instagram
                          </a>
                        )}
                        {String(draft.facebook_url ?? "").trim() ? (
                          <>
                            <a
                              href={facebookUrl(String(draft.facebook_url))}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-blue-300 hover:border-blue-500/50 hover:bg-zinc-700"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Abrir Facebook
                            </a>
                            <a
                              href={facebookAdsLibraryUrl(
                                String(draft.facebook_url),
                                lead.company_name,
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-amber-300 hover:border-amber-500/50 hover:bg-zinc-700"
                            >
                              <TrendingUp className="h-4 w-4" />
                              Ver anúncios
                            </a>
                          </>
                        ) : (
                          <a
                            href={facebookSearchUrl(lead)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-blue-300 hover:border-blue-500/50 hover:bg-zinc-700"
                          >
                            <Search className="h-4 w-4" />
                            Buscar Facebook
                          </a>
                        )}
                      </div>
                    )}
                    {(lead.maps_rating != null || lead.maps_reviews != null) && (
                      <p className="rounded-lg bg-blue-500/10 p-3 text-sm text-blue-200">
                        Google Maps: {lead.maps_rating ?? "-"} estrelas · {lead.maps_reviews ?? 0}{" "}
                        avaliações
                      </p>
                    )}
                    <div className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-200">Qualificação rápida</p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Somente respostas confirmadas aparecem no card fechado.
                        </p>
                      </div>
                      <QualificationChoice
                        label="Site"
                        value={draft.site_quality}
                        onChange={(value) => field("site_quality", value)}
                        options={[
                          { value: null, label: "Não analisado" },
                          { value: "none", label: "Não tem" },
                          { value: "bad", label: "Ruim" },
                          { value: "good", label: "Bom" },
                        ]}
                      />
                      <QualificationChoice
                        label="Instagram"
                        value={draft.instagram_quality}
                        onChange={(value) => field("instagram_quality", value)}
                        options={[
                          { value: null, label: "Não analisado" },
                          { value: "none", label: "Não tem" },
                          { value: "bad", label: "Ruim" },
                          { value: "good", label: "Bom" },
                        ]}
                      />
                      <QualificationChoice
                        label="Tráfego pago"
                        value={draft.paid_traffic_status}
                        onChange={(value) => field("paid_traffic_status", value)}
                        options={[
                          { value: null, label: "Não analisado" },
                          { value: "no", label: "Não faz" },
                          { value: "yes", label: "Faz" },
                        ]}
                      />
                      {radar ? (
                        <div className="rounded-lg border border-orange-500/25 bg-orange-500/10 p-3 text-xs text-orange-100">
                          <div className="flex items-center justify-between gap-3">
                            <span className="inline-flex items-center gap-1.5 font-semibold">
                              <Flame className="h-4 w-4 text-orange-400" /> Radar M7
                            </span>
                            <span className="text-base font-bold text-orange-300">
                              {radar.total}/100
                            </span>
                          </div>
                          <p className="mt-1.5 text-orange-200/75">
                            Indica quantas possibilidades de solução podem ser exploradas. Não é
                            prioridade nem chance de fechamento.
                          </p>
                          <p className="mt-2 text-[11px] text-orange-200/60">
                            Manual {radar.manual}: Base 20 · Site +{radar.site} · Instagram +
                            {radar.instagram} · Tráfego +{radar.traffic}
                          </p>
                          <p className="mt-1 text-[11px] font-medium text-orange-200/80">
                            Cálculo: {radar.manual} × 80% + Nota {radar.legacyScore.toFixed(1)} × 2
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500">
                          Avalie os três itens para ativar o Radar M7.
                        </p>
                      )}
                      {service && (
                        <div className={`rounded-lg border p-3 text-xs ${service.className}`}>
                          <p className="text-[11px] font-medium uppercase tracking-wide opacity-75">
                            Serviço sugerido
                          </p>
                          <p className="mt-1 text-base font-bold">{service.label}</p>
                          <p className="mt-1.5 leading-relaxed opacity-80">{service.reason}</p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor={`instagram-${lead.id}`} className="text-xs text-zinc-400">
                        Instagram
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id={`instagram-${lead.id}`}
                          type="text"
                          inputMode="url"
                          placeholder="Link ou @usuario"
                          value={String(draft.instagram_url ?? "")}
                          onChange={(e) => field("instagram_url", e.target.value)}
                          className="border-zinc-700 bg-zinc-950"
                        />
                        <a
                          href={instagramUrl(String(draft.instagram_url ?? "")) || undefined}
                          target="_blank"
                          rel="noreferrer"
                          aria-disabled={!String(draft.instagram_url ?? "").trim()}
                          className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm ${
                            String(draft.instagram_url ?? "").trim()
                              ? "bg-zinc-800 text-pink-300 hover:border-zinc-600 hover:bg-zinc-700"
                              : "pointer-events-none bg-zinc-900 text-zinc-600"
                          }`}
                        >
                          <AtSign className="h-4 w-4" />
                          Abrir
                        </a>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor={`facebook-${lead.id}`} className="text-xs text-zinc-400">
                        Facebook
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Input
                          id={`facebook-${lead.id}`}
                          type="text"
                          inputMode="url"
                          placeholder="Link ou nome da página"
                          value={String(draft.facebook_url ?? "")}
                          onChange={(e) => field("facebook_url", e.target.value)}
                          className="min-w-56 flex-1 border-zinc-700 bg-zinc-950"
                        />
                        <a
                          href={facebookUrl(String(draft.facebook_url ?? "")) || undefined}
                          target="_blank"
                          rel="noreferrer"
                          aria-disabled={!String(draft.facebook_url ?? "").trim()}
                          className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm ${
                            String(draft.facebook_url ?? "").trim()
                              ? "bg-zinc-800 text-blue-300 hover:border-zinc-600 hover:bg-zinc-700"
                              : "pointer-events-none bg-zinc-900 text-zinc-600"
                          }`}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Abrir
                        </a>
                        <a
                          href={
                            String(draft.facebook_url ?? "").trim()
                              ? facebookAdsLibraryUrl(String(draft.facebook_url), lead.company_name)
                              : undefined
                          }
                          target="_blank"
                          rel="noreferrer"
                          aria-disabled={!String(draft.facebook_url ?? "").trim()}
                          className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm ${
                            String(draft.facebook_url ?? "").trim()
                              ? "bg-zinc-800 text-amber-300 hover:border-zinc-600 hover:bg-zinc-700"
                              : "pointer-events-none bg-zinc-900 text-zinc-600"
                          }`}
                        >
                          <TrendingUp className="h-4 w-4" />
                          Ver anúncios
                        </a>
                      </div>
                    </div>
                    {lead.cnpj && (
                      <p className="rounded-lg bg-fuchsia-500/10 p-3 text-sm text-fuchsia-200">
                        CNPJ {lead.cnpj}
                        {lead.cnae ? ` · ${lead.cnae}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                      {lead.assigned_to_name && (
                        <div className="mb-3 flex items-center gap-2 text-sm text-violet-200">
                          <UserCheck className="h-4 w-4" />
                          <span>{lead.assigned_to_name}</span>
                        </div>
                      )}
                      {!lead.assigned_to ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => onAssign("claim")}
                          disabled={assigning}
                          className="w-full bg-violet-600 hover:bg-violet-500"
                        >
                          {assigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Assumir lead
                        </Button>
                      ) : lead.assigned_to === currentUserId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onAssign("release")}
                          disabled={assigning}
                          className="w-full border-zinc-700 bg-zinc-900"
                        >
                          Liberar lead
                        </Button>
                      ) : isAdmin ? (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => onAssign("takeover")}
                            disabled={assigning}
                            className="flex-1 bg-violet-600 hover:bg-violet-500"
                          >
                            Transferir para mim
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onAssign("release")}
                            disabled={assigning}
                            className="border-zinc-700 bg-zinc-900"
                          >
                            Liberar
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <label className="block text-xs text-zinc-400">
                      Etapa
                      <select
                        value={String(draft.stage ?? lead.stage)}
                        onChange={(e) => field("stage", e.target.value)}
                        className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm text-white"
                      >
                        {stages.map((stage) => (
                          <option key={stage.id} value={stage.id}>
                            {stage.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-zinc-400">
                      Serviço de interesse
                      <Input
                        value={String(draft.service_interest ?? "")}
                        onChange={(e) => field("service_interest", e.target.value)}
                        className="mt-1 border-zinc-700 bg-zinc-950"
                      />
                    </label>
                    <label className="block text-xs text-zinc-400">
                      Próxima ação
                      <Input
                        value={String(draft.next_action ?? "")}
                        onChange={(e) => field("next_action", e.target.value)}
                        className="mt-1 border-zinc-700 bg-zinc-950"
                      />
                    </label>
                    <label className="block text-xs text-zinc-400">
                      Data da próxima ação
                      <Input
                        type="datetime-local"
                        value={
                          draft.next_action_at ? String(draft.next_action_at).slice(0, 16) : ""
                        }
                        onChange={(e) =>
                          field(
                            "next_action_at",
                            e.target.value ? new Date(e.target.value).toISOString() : null,
                          )
                        }
                        className="mt-1 border-zinc-700 bg-zinc-950"
                      />
                    </label>
                    <label className="block text-xs text-zinc-400">
                      Anotações
                      <Textarea
                        value={String(draft.notes ?? "")}
                        onChange={(e) => field("notes", e.target.value)}
                        rows={4}
                        className="mt-1 border-zinc-700 bg-zinc-950"
                      />
                    </label>
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          Materiais favoritos
                        </p>
                        {favoriteMaterials.length > 0 && (
                          <span className="text-[11px] text-zinc-500">
                            {favoriteMaterials.length} favorito
                            {favoriteMaterials.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      {materialsQuery.isLoading ? (
                        <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-zinc-800">
                          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                        </div>
                      ) : favoriteMaterials.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-zinc-800 px-3 py-5 text-center text-xs text-zinc-500">
                          Favorite materiais na seção Materiais para acessá-los aqui.
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {favoriteMaterials.map((material) => {
                            const format = normalizeMaterialFormat(material.content_format);
                            return (
                              <button
                                key={material.id}
                                type="button"
                                onClick={() => setSelectedMaterial(material)}
                                className={`group relative aspect-square min-h-32 rounded-xl border bg-zinc-950 p-3 text-left transition hover:-translate-y-0.5 hover:border-blue-500/70 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  selectedMaterial?.id === material.id
                                    ? "border-blue-500"
                                    : "border-zinc-800"
                                }`}
                              >
                                <span
                                  className={`absolute left-2 top-2 rounded-md border px-1.5 py-0.5 text-[9px] font-medium ${MATERIAL_FORMAT_BADGE_STYLES[format]}`}
                                >
                                  {MATERIAL_FORMAT_LABELS[format]}
                                </span>
                                <span className="flex h-full items-center justify-center px-1 pb-4 text-center text-sm font-semibold leading-snug text-zinc-100">
                                  {material.title}
                                </span>
                                <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate text-[10px] text-zinc-500 group-hover:text-zinc-400">
                                  {material.author_name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 pt-4">
                  <Button
                    variant="outline"
                    onClick={onClose}
                    className="border-zinc-700 bg-zinc-900"
                  >
                    Fechar
                  </Button>
                  <Button
                    onClick={() =>
                      onSave({
                        stage: draft.stage,
                        service_interest: draft.service_interest,
                        next_action: draft.next_action,
                        next_action_at: draft.next_action_at,
                        instagram_url: draft.instagram_url,
                        facebook_url: draft.facebook_url,
                        address_verified: draft.address_verified,
                        site_quality: draft.site_quality,
                        instagram_quality: draft.instagram_quality,
                        paid_traffic_status: draft.paid_traffic_status,
                        notes: draft.notes,
                      })
                    }
                    disabled={saving}
                  >
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
                  </Button>
                  <Button
                    onClick={onSend}
                    disabled={sending}
                    className="bg-emerald-600 hover:bg-emerald-500"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    {lead.group_sent_at ? "Enviar novamente" : "Enviar no WhatsApp"}
                  </Button>
                </div>
                {activities.length > 0 && (
                  <div className="border-t border-zinc-800 pt-4">
                    <h3 className="mb-2 text-sm font-semibold">Histórico</h3>
                    <div className="space-y-2">
                      {activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex justify-between gap-4 text-xs text-zinc-400"
                        >
                          <span>{activity.description}</span>
                          <span className="shrink-0">{when(activity.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {selectedMaterial && (
                <aside className="min-w-0 rounded-xl border border-zinc-700 bg-zinc-950/80 p-4 xl:sticky xl:top-0 xl:max-h-[78vh] xl:overflow-y-auto">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md border px-2 py-1 text-[11px] font-medium ${MATERIAL_FORMAT_BADGE_STYLES[normalizeMaterialFormat(selectedMaterial.content_format)]}`}
                        >
                          {
                            MATERIAL_FORMAT_LABELS[
                              normalizeMaterialFormat(selectedMaterial.content_format)
                            ]
                          }
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {selectedMaterial.author_name}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold leading-snug text-zinc-100">
                        {selectedMaterial.title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedMaterial(null)}
                      aria-label="Fechar material"
                      className="shrink-0 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {selectedMaterial.usage_context && (
                    <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
                        Uso
                      </p>
                      <p className="text-sm leading-5 text-zinc-300">
                        {selectedMaterial.usage_context}
                      </p>
                    </div>
                  )}
                  <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                    {selectedMaterial.message}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(selectedMaterial.message)
                        .then(() => toast.success("Mensagem copiada."))
                        .catch(() => toast.error("Não foi possível copiar a mensagem."));
                    }}
                    className="mt-5 w-full border-zinc-700 bg-zinc-900 text-zinc-200"
                  >
                    <Clipboard className="mr-2 h-4 w-4" />
                    Copiar mensagem
                  </Button>
                </aside>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function QualificationChoice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  options: { value: string | null; label: string }[];
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-zinc-400">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = (value ?? null) === option.value;
          return (
            <button
              key={option.value ?? "unconfirmed"}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`rounded-md border px-2.5 py-1.5 text-xs transition ${
                active
                  ? "border-blue-500 bg-blue-500/15 text-blue-200"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-zinc-500 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <div>
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="text-sm text-zinc-200">{value}</p>
      </div>
    </div>
  );
}
