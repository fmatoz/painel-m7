import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AtSign,
  Building2,
  CalendarClock,
  Columns3,
  ExternalLink,
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

type Lead = Tables<"crm_leads">;
type Activity = Tables<"crm_activities">;
type Stage = Lead["stage"];

const CRM_API_URL = "https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-crm/api";
const CRM_WHATSAPP_URL = "https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-crm/whatsapp";

async function crmApi<T>(token: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(CRM_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
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
  if (!response.ok) throw new Error(`WhatsApp indisponível (${response.status})`);
  const result = (await response.json()) as { ok?: boolean; error?: string };
  if (!result.ok) throw new Error(result.error || "Não foi possível enviar o lead ao grupo.");
}

const stages: { id: Stage; label: string; color: string }[] = [
  { id: "novo", label: "Novo lead", color: "bg-sky-400" },
  { id: "primeiro_contato", label: "Primeiro contato", color: "bg-blue-500" },
  { id: "respondeu", label: "Respondeu", color: "bg-cyan-400" },
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

function googleMapsUrl(lead: Lead) {
  const location = lead.address || [lead.city, lead.state].filter(Boolean).join(" - ");
  const query = [lead.company_name, location].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function instagramUrl(value: string | null | undefined) {
  const clean = value?.trim();
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  if (/^(www\.)?instagram\.com\//i.test(clean)) return `https://${clean}`;
  return `https://www.instagram.com/${clean.replace(/^@/, "").replace(/^\/+|\/+$/g, "")}`;
}

function CrmComponent() {
  const sidebar = useAppSidebar();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("Todos");
  const [assignee, setAssignee] = useState("all");
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
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

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
    mutationFn: async ({ id, mode }: { id: string; mode: "claim" | "release" | "takeover" }) =>
      crmApi<Lead>(session!.access_token, { action: "assign", leadId: id, assignmentMode: mode }),
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      setSelected((current) => (current?.id === lead.id ? lead : current));
      toast.success(
        lead.assigned_to_name ? `Lead atribuído a ${lead.assigned_to_name}.` : "Lead liberado.",
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível alterar o responsável.",
      ),
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
      toast.success("Lead enviado ao grupo pela Ester.");
    },
    onError: () => toast.error("Não foi possível enviar o lead ao grupo."),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (leadsQuery.data ?? []).filter((lead) => {
      const matchesSource = source === "Todos" || lead.source === source;
      const matchesAssignee =
        assignee === "all" ||
        (assignee === "mine" && lead.assigned_to === user?.id) ||
        (assignee === "unassigned" && !lead.assigned_to) ||
        lead.assigned_to === assignee;
      const matchesText =
        !needle ||
        [lead.company_name, lead.partner_name, lead.city, lead.phone, lead.cnpj].some((value) =>
          value?.toLowerCase().includes(needle),
        );
      return matchesSource && matchesAssignee && matchesText;
    });
  }, [leadsQuery.data, search, source, assignee, user?.id]);

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
                    {name}
                  </option>
                ))}
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
                    const assignmentDifference =
                      Number(Boolean(b.assigned_to)) - Number(Boolean(a.assigned_to));
                    if (assignmentDifference !== 0) return assignmentDifference;

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
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
        <span className="truncate">{lead.source}</span>
        <span className="truncate text-right">{lead.city || "Cidade não informada"}</span>
      </div>
      {!mapsOnly && (
        <p className="mt-2 text-xs font-medium text-zinc-300">{money(lead.capital_social)}</p>
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
  useEffect(() => {
    setDraft(lead ?? {});
    if (!lead) return;
    void crmApi<Activity[]>(accessToken, { action: "activities", leadId: lead.id })
      .then((data) => setActivities(data ?? []))
      .catch(() => setActivities([]));
  }, [lead, accessToken]);
  const field = (key: keyof Lead, value: unknown) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <Dialog open={!!lead} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-zinc-700 bg-zinc-900 text-white sm:max-w-3xl">
        {lead && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 pr-8 text-xl">
                {lead.company_name}
                <span className="rounded-lg bg-blue-500/15 px-2.5 py-1 text-sm text-blue-300">
                  Nota {Number(lead.score).toFixed(1)}
                </span>
              </DialogTitle>
              <DialogDescription className="text-zinc-400">
                {lead.source} · {lead.city || "Cidade não informada"}
                {lead.state ? `/${lead.state}` : ""}
              </DialogDescription>
            </DialogHeader>
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
                {(lead.website || lead.source === "Maps" || lead.source === "Maps + CNPJ") && (
                  <div className="flex flex-wrap gap-2">
                    {lead.website && (
                      <a
                        href={
                          lead.website.startsWith("http") ? lead.website : `https://${lead.website}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-blue-300 hover:border-zinc-600 hover:bg-zinc-700"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Abrir site
                      </a>
                    )}
                    {(lead.source === "Maps" || lead.source === "Maps + CNPJ") && (
                      <a
                        href={googleMapsUrl(lead)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-blue-300 hover:border-zinc-600 hover:bg-zinc-700"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Abrir no Maps
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
                    value={draft.next_action_at ? String(draft.next_action_at).slice(0, 16) : ""}
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
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 pt-4">
              <Button variant="outline" onClick={onClose} className="border-zinc-700 bg-zinc-900">
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
                {lead.group_sent_at ? "Enviar novamente ao grupo" : "Enviar ao grupo"}
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
          </>
        )}
      </DialogContent>
    </Dialog>
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
