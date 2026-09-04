import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarClock,
  Columns3,
  ExternalLink,
  Home,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
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

type Lead = Tables<"crm_leads">;
type Activity = Tables<"crm_activities">;
type Stage = Lead["stage"];

const CRM_API_URL = "https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-crm/api";
const CRM_WHATSAPP_URL =
  "https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-crm/whatsapp";

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

function CrmComponent() {
  const [sidebar, setSidebar] = useState(false);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("Todos");
  const [selected, setSelected] = useState<Lead | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, session, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", search: {} as never });
  }, [loading, session, navigate]);

  const leadsQuery = useQuery({
    queryKey: ["crm-leads"],
    enabled: !!session,
    queryFn: () => crmApi<Lead[]>(session!.access_token, { action: "list" }),
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
      const matchesText =
        !needle ||
        [lead.company_name, lead.partner_name, lead.city, lead.phone, lead.cnpj].some((value) =>
          value?.toLowerCase().includes(needle),
        );
      return matchesSource && matchesText;
    });
  }, [leadsQuery.data, search, source]);

  if (loading || !session)
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-white">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-zinc-800 bg-zinc-900 transition-transform lg:translate-x-0 ${sidebar ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-zinc-800 px-6">
          <img src="/logo-v2.png" alt="Gestão M7" className="h-10 object-contain" />
          <button onClick={() => setSidebar(false)} className="lg:hidden">
            <X className="h-6 w-6 text-zinc-400" />
          </button>
        </div>
        <nav className="space-y-2 p-4">
          <Nav href="/inicio" icon={<Home />} label="Início" />
          <Nav href="/dashboard" icon={<LayoutDashboard />} label="Workflows" />
          <Nav href="/crm" icon={<Columns3 />} label="CRM" active />
          <Nav href="/financeiro" icon={<TrendingUp />} label="Financeiro" />
        </nav>
      </aside>

      <main className="flex h-full min-w-0 flex-1 flex-col lg:pl-64">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-950/90 px-4 backdrop-blur md:px-6">
          <button onClick={() => setSidebar(true)} className="lg:hidden">
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
                const stageLeads = filtered.filter((lead) => {
                  if (lead.stage !== column.stage) return false;
                  if (column.sourceGroup === "maps") {
                    return lead.source === "Maps" || lead.source === "Maps + CNPJ";
                  }
                  if (column.sourceGroup === "cnpj") return lead.source === "CNPJ";
                  return true;
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
  const hasMaps = mapsOnly || lead.source === "Maps + CNPJ";
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
        <span className="rounded-md bg-blue-500/15 px-2 py-1 text-xs font-bold text-blue-300">
          {Number(lead.score).toFixed(1)}
        </span>
      </div>
      {mapsOnly ? (
        <div
          className={`mt-2 flex items-center gap-1.5 text-xs ${ownWebsite ? "text-emerald-300" : "text-amber-300"}`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>{ownWebsite ? "Com site" : "Sem site"}</span>
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
      {hasMaps && (
        <a
          href={googleMapsUrl(lead)}
          target="_blank"
          rel="noreferrer"
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          className="mt-2 flex w-fit items-center gap-1 text-[11px] font-medium text-blue-300 hover:text-blue-200 hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Abrir no Maps
        </a>
      )}
      {lead.next_action_at && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-300">
          <CalendarClock className="h-3 w-3" />
          {when(lead.next_action_at)}
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
  accessToken,
}: {
  lead: Lead | null;
  onClose: () => void;
  onSave: (changes: Partial<Lead>) => void;
  onSend: () => void;
  saving: boolean;
  sending: boolean;
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
                    {hasOwnWebsite(lead.website) ? "Possui site próprio" : "Não possui site próprio"}
                  </p>
                )}
                {lead.address && (
                  <Info icon={<Building2 />} label="Endereço" value={lead.address} />
                )}
                {lead.website && (
                  <a
                    href={
                      lead.website.startsWith("http") ? lead.website : `https://${lead.website}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-400 hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir site
                  </a>
                )}
                {(lead.maps_rating != null || lead.maps_reviews != null) && (
                  <p className="rounded-lg bg-blue-500/10 p-3 text-sm text-blue-200">
                    Google Maps: {lead.maps_rating ?? "-"} estrelas · {lead.maps_reviews ?? 0}{" "}
                    avaliações
                  </p>
                )}
                {lead.cnpj && (
                  <p className="rounded-lg bg-fuchsia-500/10 p-3 text-sm text-fuchsia-200">
                    CNPJ {lead.cnpj}
                    {lead.cnae ? ` · ${lead.cnae}` : ""}
                  </p>
                )}
              </div>
              <div className="space-y-3">
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
