import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  BookOpenText,
  CalendarDays,
  Check,
  ChevronDown,
  Cloud,
  CloudAlert,
  Columns3,
  Flame,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Megaphone,
  NotebookPen,
  Plus,
  Rocket,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { Progress } from "@/components/ui/progress";
import { AppSidebar } from "@/components/app-sidebar";
import { useAppSidebar } from "@/hooks/use-app-sidebar";
import { useAppAccess } from "@/hooks/use-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Priority = {
  id: string;
  text: string;
  done: boolean;
};

type Goal = {
  id: string;
  title: string;
  progress: number;
  dueDate: string;
};

type HomeWorkspace = {
  focusText: string;
  priorities: Priority[];
  goals: Goal[];
  notes: string;
};

type SaveState = "loading" | "saved" | "saving" | "error";
type Lead = Tables<"crm_leads">;
type TeamSettings = Tables<"team_settings">;

type FinanceData = {
  kpis: {
    recebido: number;
    a_receber: number;
    despesas_pagas: number;
    caixa_mes: number;
    receita_recorrente: number;
    receita_unica: number;
  };
};

type WorkflowSummary = {
  id: string;
  active: boolean;
};

const CRM_API_URL = "https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-crm/api";

async function crmApi<T>(token: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(CRM_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    cache: "no-store",
    body: JSON.stringify({ token, ...payload }),
  });
  if (!response.ok) throw new Error(`CRM indisponível (${response.status})`);
  const result = (await response.json()) as { ok?: boolean; data?: T; error?: string };
  if (!result.ok) throw new Error(result.error || "Não foi possível carregar o CRM.");
  return result.data as T;
}

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value || 0);

const defaultPriorities: Priority[] = [
  { id: "priority-1", text: "", done: false },
  { id: "priority-2", text: "", done: false },
  { id: "priority-3", text: "", done: false },
];

const emptyWorkspace: HomeWorkspace = {
  focusText: "",
  priorities: defaultPriorities,
  goals: [],
  notes: "",
};

export const Route = createFileRoute("/inicio")({
  head: () => ({
    title: "Início | Painel M7",
    meta: [{ name: "description", content: "Seu ponto de partida para o trabalho na M7." }],
  }),
  component: InicioComponent,
});

function normalizePriorities(value: Json): Priority[] {
  if (!Array.isArray(value)) return defaultPriorities;
  const items = value.slice(0, 3).map((item, index) => {
    const record = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    return {
      id: typeof record.id === "string" ? record.id : `priority-${index + 1}`,
      text: typeof record.text === "string" ? record.text : "",
      done: record.done === true,
    };
  });
  while (items.length < 3) {
    items.push({ id: `priority-${items.length + 1}`, text: "", done: false });
  }
  return items;
}

function normalizeGoals(value: Json): Goal[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const progress = typeof item.progress === "number" ? item.progress : 0;
    return [
      {
        id: typeof item.id === "string" ? item.id : `goal-${index + 1}`,
        title: typeof item.title === "string" ? item.title : "",
        progress: Math.max(0, Math.min(100, progress)),
        dueDate: typeof item.dueDate === "string" ? item.dueDate : "",
      },
    ];
  });
}

function InicioComponent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, session, loading: authLoading, signOut } = useAuth();
  const sidebar = useAppSidebar();
  const access = useAppAccess();
  const [workspace, setWorkspace] = useState<HomeWorkspace>(emptyWorkspace);
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [commissionRate, setCommissionRate] = useState("15");

  const canUseCrm = access.can("crm");
  const canUseFinance = access.can("financeiro");
  const canUseWorkflows = access.can("workflows");
  const isAdmin = Boolean(access.profile?.is_admin);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const settingsQuery = useQuery({
    queryKey: ["team-settings"],
    enabled: Boolean(session && !access.loading && access.can("inicio")),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_settings")
        .select("*")
        .eq("id", "global")
        .single();
      if (error) throw error;
      return data as TeamSettings;
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const leadsQuery = useQuery({
    queryKey: ["crm-leads"],
    enabled: Boolean(session && !access.loading && canUseCrm),
    queryFn: () => crmApi<Lead[]>(session!.access_token, { action: "list" }),
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const financeQuery = useQuery({
    queryKey: ["finance-dashboard", currentMonth],
    enabled: Boolean(session && !access.loading && canUseFinance),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("n8n-workflows", {
        body: { action: "finance-dashboard", mes: currentMonth },
      });
      if (error) throw error;
      return data as FinanceData;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const workflowsQuery = useQuery({
    queryKey: ["n8n-workflows"],
    enabled: Boolean(session && !access.loading && isAdmin && canUseWorkflows),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("n8n-workflows", {
        body: { action: "list" },
      });
      if (error) throw error;
      return ((data.data ?? []) as WorkflowSummary[]) || [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const usersQuery = useQuery({
    queryKey: ["home-active-users"],
    enabled: Boolean(session && !access.loading && isAdmin),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("app_users")
        .select("user_id", { count: "exact", head: true })
        .eq("active", true);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setAnnouncementTitle(settingsQuery.data.announcement_title ?? "");
    setAnnouncementMessage(settingsQuery.data.announcement_message ?? "");
    setCommissionRate(String(settingsQuery.data.commission_rate ?? 15));
  }, [settingsQuery.data]);

  const saveTeamSettings = useMutation({
    mutationFn: async () => {
      const rate = Number(commissionRate.replace(",", "."));
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        throw new Error("Informe uma comissão entre 0% e 100%.");
      }
      const { error } = await supabase.from("team_settings").upsert(
        {
          id: "global",
          announcement_title: announcementTitle.trim(),
          announcement_message: announcementMessage.trim(),
          commission_rate: rate,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-settings"] });
      toast.success("Aviso e comissão atualizados para a equipe.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar."),
  });

  useEffect(() => {
    if (!authLoading && !session) {
      navigate({ to: "/login", search: { next: undefined } });
    }
  }, [authLoading, navigate, session]);
  useEffect(() => {
    if (!access.loading && session && !access.can("inicio")) {
      window.location.href = access.firstAllowedPath;
    }
  }, [access, session]);

  useEffect(() => {
    if (!session) return;
    let active = true;

    async function loadWorkspace() {
      setSaveState("loading");
      const { data, error } = await supabase
        .from("home_workspaces")
        .select("focus_text, priorities, goals, notes")
        .maybeSingle();

      if (!active) return;
      if (error) {
        setLoadError(
          "Não foi possível carregar sua página inicial. A estrutura do banco pode ainda não ter sido publicada.",
        );
        setSaveState("error");
        return;
      }

      if (data) {
        setWorkspace({
          focusText: data.focus_text,
          priorities: normalizePriorities(data.priorities),
          goals: normalizeGoals(data.goals),
          notes: data.notes,
        });
      }
      setSaveState("saved");
    }

    loadWorkspace();
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!isDirty || !user) return;
    let active = true;
    const snapshot = workspace;
    setSaveState("saving");

    const timer = window.setTimeout(async () => {
      const { error } = await supabase.from("home_workspaces").upsert(
        {
          user_id: user.id,
          focus_text: snapshot.focusText,
          priorities: snapshot.priorities as unknown as Json,
          goals: snapshot.goals as unknown as Json,
          notes: snapshot.notes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (!active) return;
      if (error) {
        setSaveState("error");
        setLoadError(
          "Não foi possível salvar agora. Suas alterações continuam nesta tela para você tentar novamente.",
        );
        return;
      }
      setIsDirty(false);
      setLoadError("");
      setSaveState("saved");
    }, 800);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isDirty, user, workspace]);

  const updateWorkspace = (updater: (current: HomeWorkspace) => HomeWorkspace) => {
    setWorkspace(updater);
    setIsDirty(true);
  };

  const completedPriorities = useMemo(
    () => workspace.priorities.filter((priority) => priority.done && priority.text.trim()).length,
    [workspace.priorities],
  );

  const firstName = useMemo(() => {
    const fullName = access.profile?.full_name?.trim();
    if (fullName) return fullName.split(/\s+/)[0];
    const emailName = user?.email?.split("@")[0] || "por aí";
    return emailName.charAt(0).toUpperCase() + emailName.slice(1);
  }, [access.profile?.full_name, user?.email]);

  const greeting = now.getHours() < 12 ? "Bom dia" : now.getHours() < 18 ? "Boa tarde" : "Boa noite";
  const motivationalMessage = useMemo(() => {
    const salesMessages = [
      "Vamos vender 3 sites hoje?",
      "Bora transformar boas conversas em novos clientes?",
      "Hoje tem oportunidade esperando uma boa abordagem.",
      "Um contato de cada vez. Vamos fazer acontecer?",
      "Site, tráfego ou automação: qual solução vamos vender hoje?",
      "A próxima conversa pode virar um grande cliente.",
    ];
    const generalMessages = [
      "Vamos fazer um dia produtivo?",
      "Pequenos avanços também constroem grandes resultados.",
      "Bora tirar as prioridades do papel?",
      "Hoje é um bom dia para fazer acontecer.",
    ];
    const messages = canUseCrm ? salesMessages : generalMessages;
    const day = Math.floor(now.getTime() / 86_400_000);
    const period = Math.floor(now.getHours() / 4);
    return messages[(day + period + firstName.length) % messages.length];
  }, [canUseCrm, firstName, now]);

  const personalLeads = useMemo(
    () =>
      (leadsQuery.data ?? []).filter(
        (lead) => !lead.assigned_to || lead.assigned_to === user?.id,
      ),
    [leadsQuery.data, user?.id],
  );

  const crmSummary = useMemo(() => {
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const activeStages = new Set(["novo", "primeiro_contato", "respondeu", "follow_up", "reuniao", "proposta"]);
    const due = personalLeads.filter(
      (lead) =>
        lead.next_action_at &&
        activeStages.has(lead.stage) &&
        new Date(lead.next_action_at).getTime() <= endOfToday.getTime(),
    ).length;
    return {
      due,
      newLeads: personalLeads.filter((lead) => lead.stage === "novo").length,
      conversations: personalLeads.filter((lead) => lead.stage === "respondeu").length,
      followUps: personalLeads.filter((lead) => lead.stage === "follow_up").length,
      meetings: personalLeads.filter((lead) => lead.stage === "reuniao").length,
      proposals: personalLeads.filter((lead) => lead.stage === "proposta").length,
      clients: personalLeads.filter((lead) => lead.stage === "cliente").length,
    };
  }, [now, personalLeads]);

  const globalCrmSummary = useMemo(() => {
    const leads = leadsQuery.data ?? [];
    return {
      total: leads.length,
      unassigned: leads.filter((lead) => !lead.assigned_to).length,
      conversations: leads.filter((lead) => lead.stage === "respondeu").length,
      followUps: leads.filter((lead) => lead.stage === "follow_up").length,
      proposals: leads.filter((lead) => lead.stage === "proposta").length,
      clients: leads.filter((lead) => lead.stage === "cliente").length,
    };
  }, [leadsQuery.data]);

  const today = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(now);

  const addGoal = () => {
    if (workspace.goals.length >= 8) return;
    updateWorkspace((current) => ({
      ...current,
      goals: [...current.goals, { id: crypto.randomUUID(), title: "", progress: 0, dueDate: "" }],
    }));
  };

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login", search: { next: undefined } });
  };

  if (authLoading || access.loading || !session || !access.can("inicio")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-white">
      <AppSidebar active="inicio" {...sidebar} />

      <main
        className={`flex h-full min-w-0 flex-1 flex-col transition-[padding] duration-200 ${sidebar.collapsed ? "lg:pl-20" : "lg:pl-64"}`}
      >
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/85 px-4 backdrop-blur md:px-6">
          <button
            onClick={() => sidebar.setMobileOpen(true)}
            className="lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-6 w-6 text-zinc-400" />
          </button>
          <div className="ml-auto flex items-center gap-3">
            <div
              className={`hidden items-center gap-2 text-xs sm:flex ${saveState === "error" ? "text-red-400" : "text-zinc-500"}`}
            >
              {saveState === "loading" || saveState === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saveState === "error" ? (
                <CloudAlert className="h-4 w-4" />
              ) : (
                <Cloud className="h-4 w-4 text-emerald-400" />
              )}
              {saveState === "loading"
                ? "Carregando"
                : saveState === "saving"
                  ? "Salvando"
                  : saveState === "error"
                    ? "Erro ao salvar"
                    : "Salvo na nuvem"}
            </div>
            <span className="hidden text-xs text-zinc-500 md:inline">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              aria-label="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-10">
          <div className="mx-auto max-w-6xl space-y-6">
            <section className="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-950 via-zinc-900 to-fuchsia-950/60 p-6 shadow-2xl shadow-blue-950/20 md:p-9">
              <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-3xl" />
              <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="mb-4 flex items-center gap-2 text-sm capitalize text-blue-200/70">
                    <CalendarDays className="h-4 w-4" />
                    {today}
                  </p>
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-300">
                    <Sparkles className="h-4 w-4" />
                    Seu ponto de partida
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-white md:text-5xl">
                    {greeting}, {firstName}!
                  </h1>
                  <p className="mt-3 text-lg text-zinc-300 md:text-xl">{motivationalMessage}</p>
                </div>
                {canUseCrm && (
                  <a
                    href="/crm"
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:-translate-y-0.5 hover:bg-blue-500"
                  >
                    <Rocket className="h-5 w-5" />
                    Começar pelo CRM
                    <ArrowRight className="h-4 w-4" />
                  </a>
                )}
              </div>
            </section>

            {loadError && (
              <div className="rounded-xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                {loadError}
              </div>
            )}

            {(settingsQuery.data?.announcement_title || settingsQuery.data?.announcement_message) && (
              <section className="rounded-2xl border border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-zinc-900 to-orange-500/5 p-5 md:p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-amber-500/15 p-3 text-amber-300">
                    <Megaphone className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">
                      Aviso da equipe
                    </p>
                    {settingsQuery.data.announcement_title && (
                      <h2 className="mt-1 text-lg font-bold text-zinc-100">
                        {settingsQuery.data.announcement_title}
                      </h2>
                    )}
                    {settingsQuery.data.announcement_message && (
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                        {settingsQuery.data.announcement_message}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Acesso rápido</h2>
                  <p className="text-sm text-zinc-500">Só aparece o que você pode acessar.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {canUseCrm && (
                  <QuickLink
                    href="/crm"
                    icon={<Columns3 />}
                    title="Abrir CRM"
                    description="Continue sua prospecção"
                    accent="blue"
                  />
                )}
                {canUseCrm && (
                  <QuickLink
                    href="/materiais"
                    icon={<BookOpenText />}
                    title="Materiais"
                    description="Respostas e textos favoritos"
                    accent="violet"
                  />
                )}
                {canUseCrm && (
                  <QuickLink
                    href="/vendas"
                    icon={<BadgeDollarSign />}
                    title="Vendas e comissões"
                    description="Registre vendas e acompanhe ganhos"
                    accent="emerald"
                  />
                )}
                {canUseFinance && (
                  <QuickLink
                    href="/financeiro"
                    icon={<TrendingUp />}
                    title="Financeiro"
                    description="Acompanhe caixa e recebimentos"
                    accent="emerald"
                  />
                )}
                {canUseWorkflows && (
                  <QuickLink
                    href="/dashboard"
                    icon={<LayoutDashboard />}
                    title="Workflows"
                    description="Veja suas automações"
                    accent="amber"
                  />
                )}
                {isAdmin && (
                  <QuickLink
                    href="/usuarios"
                    icon={<Users />}
                    title="Equipe"
                    description="Usuários e permissões"
                    accent="pink"
                  />
                )}
              </div>
            </section>

            {canUseCrm && (
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 md:p-6">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Flame className="h-5 w-5 text-orange-400" />
                      <h2 className="text-lg font-semibold">Minha missão de hoje</h2>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      Seus leads e os ainda não atribuídos, sem transformar nota em prioridade.
                    </p>
                  </div>
                  <a
                    href="/crm"
                    className="inline-flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300"
                  >
                    Ver pipeline <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
                {leadsQuery.isLoading ? (
                  <LoadingBlock />
                ) : leadsQuery.error ? (
                  <UnavailableBlock label="Não foi possível carregar o resumo do CRM." />
                ) : (
                  <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                    <MetricCard label="Ações para hoje" value={crmSummary.due} tone="orange" />
                    <MetricCard label="Novos leads" value={crmSummary.newLeads} tone="blue" />
                    <MetricCard
                      label="Em conversa"
                      value={crmSummary.conversations}
                      tone="cyan"
                    />
                    <MetricCard label="Follow-Up" value={crmSummary.followUps} tone="violet" />
                    <MetricCard label="Reuniões" value={crmSummary.meetings} tone="amber" />
                    <MetricCard label="Propostas" value={crmSummary.proposals} tone="orange" />
                    <MetricCard label="Clientes" value={crmSummary.clients} tone="emerald" />
                  </div>
                )}
              </section>
            )}

            {canUseFinance && (
              <section className="rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-950/20 to-zinc-900 p-5 md:p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Banknote className="h-5 w-5 text-emerald-400" />
                      <h2 className="text-lg font-semibold">Resumo financeiro do mês</h2>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      Visível somente para quem possui acesso ao Financeiro.
                    </p>
                  </div>
                  <a
                    href="/financeiro"
                    className="hidden items-center gap-2 text-sm font-medium text-emerald-400 hover:text-emerald-300 sm:inline-flex"
                  >
                    Abrir financeiro <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
                {financeQuery.isLoading ? (
                  <LoadingBlock />
                ) : financeQuery.error ? (
                  <UnavailableBlock label="Não foi possível carregar o resumo financeiro." />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <ValueCard
                      label="Recebido"
                      value={money(financeQuery.data?.kpis.recebido ?? 0)}
                      tone="emerald"
                    />
                    <ValueCard
                      label="A receber"
                      value={money(financeQuery.data?.kpis.a_receber ?? 0)}
                      tone="blue"
                    />
                    <ValueCard
                      label="Despesas"
                      value={money(financeQuery.data?.kpis.despesas_pagas ?? 0)}
                      tone="red"
                    />
                    <ValueCard
                      label="Caixa"
                      value={money(financeQuery.data?.kpis.caixa_mes ?? 0)}
                      tone="zinc"
                    />
                  </div>
                )}
              </section>
            )}

            {isAdmin && (
              <section className="rounded-2xl border border-fuchsia-500/20 bg-zinc-900/80 p-5 md:p-6">
                <div className="mb-6 rounded-xl border border-amber-500/20 bg-zinc-950/60 p-4 md:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-amber-400" />
                    <div>
                      <h2 className="font-semibold">Comunicado e comissão</h2>
                      <p className="text-xs text-zinc-500">
                        O aviso aparece no Início de todos. A nova porcentagem vale somente para vendas cadastradas depois da alteração.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
                    <label className="text-xs text-zinc-400">
                      Título do aviso
                      <Input
                        value={announcementTitle}
                        onChange={(event) => setAnnouncementTitle(event.target.value)}
                        maxLength={120}
                        placeholder="Ex.: Comissão especial hoje"
                        className="mt-1 border-zinc-700 bg-zinc-950"
                      />
                    </label>
                    <label className="text-xs text-zinc-400">
                      Comissão vigente (%)
                      <Input
                        value={commissionRate}
                        onChange={(event) => setCommissionRate(event.target.value)}
                        inputMode="decimal"
                        placeholder="15"
                        className="mt-1 border-zinc-700 bg-zinc-950"
                      />
                    </label>
                  </div>
                  <label className="mt-4 block text-xs text-zinc-400">
                    Mensagem para a equipe
                    <Textarea
                      value={announcementMessage}
                      onChange={(event) => setAnnouncementMessage(event.target.value)}
                      maxLength={1200}
                      rows={3}
                      placeholder="Ex.: Hoje a comissão será de 20%. Vamos vender!"
                      className="mt-1 border-zinc-700 bg-zinc-950"
                    />
                  </label>
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={() => saveTeamSettings.mutate()}
                      disabled={saveTeamSettings.isPending || settingsQuery.isLoading}
                      className="bg-amber-600 text-white hover:bg-amber-500"
                    >
                      {saveTeamSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Salvar para todos
                    </Button>
                  </div>
                </div>
                <div className="mb-5">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-fuchsia-400" />
                    <h2 className="text-lg font-semibold">Visão da operação</h2>
                    <span className="rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-300">
                      ADM
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">
                    Um panorama geral que aparece somente para administradores.
                  </p>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  {canUseCrm && (
                    <OperationCard
                      title="Pipeline da equipe"
                      icon={<Columns3 />}
                      href="/crm"
                      loading={leadsQuery.isLoading}
                      rows={[
                        ["Leads no CRM", globalCrmSummary.total],
                        ["Sem responsável", globalCrmSummary.unassigned],
                        ["Em conversa", globalCrmSummary.conversations],
                        ["Follow-Ups", globalCrmSummary.followUps],
                        ["Propostas", globalCrmSummary.proposals],
                        ["Clientes", globalCrmSummary.clients],
                      ]}
                    />
                  )}
                  <OperationCard
                    title="Equipe"
                    icon={<Users />}
                    href="/usuarios"
                    loading={usersQuery.isLoading}
                    rows={[["Usuários ativos", usersQuery.data ?? 0]]}
                  />
                  {canUseWorkflows && (
                    <OperationCard
                      title="Automações"
                      icon={<LayoutDashboard />}
                      href="/dashboard"
                      loading={workflowsQuery.isLoading}
                      rows={[
                        ["Workflows", workflowsQuery.data?.length ?? 0],
                        [
                          "Ativos",
                          workflowsQuery.data?.filter((workflow) => workflow.active).length ?? 0,
                        ],
                        [
                          "Inativos",
                          workflowsQuery.data?.filter((workflow) => !workflow.active).length ?? 0,
                        ],
                      ]}
                    />
                  )}
                </div>
              </section>
            )}

            <details className="group rounded-2xl border border-zinc-800 bg-zinc-900/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-zinc-800 p-2.5 text-zinc-300">
                    <NotebookPen className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold">Meu espaço pessoal</h2>
                    <p className="text-sm text-zinc-500">
                      Foco, prioridades, metas e anotações que já estavam aqui.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden text-xs text-zinc-500 sm:block">
                    {completedPriorities} de 3 prioridades concluídas
                  </span>
                  <ChevronDown className="h-5 w-5 text-zinc-500 transition group-open:rotate-180" />
                </div>
              </summary>
              <div className="space-y-6 border-t border-zinc-800 p-5 md:p-6">

            <section className="rounded-2xl border border-blue-900/60 bg-gradient-to-br from-blue-950/70 to-zinc-900 p-5 md:p-7">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-blue-300">
                <Target className="h-4 w-4" />
                Foco atual
              </div>
              <input
                value={workspace.focusText}
                maxLength={500}
                onChange={(event) =>
                  updateWorkspace((current) => ({ ...current, focusText: event.target.value }))
                }
                placeholder="No que vale a pena trabalhar agora?"
                className="w-full border-0 bg-transparent text-xl font-medium text-white outline-none placeholder:text-zinc-600 md:text-2xl"
              />
            </section>

            <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
                <div className="mb-5">
                  <h2 className="text-lg font-semibold">Três prioridades</h2>
                  <p className="mt-1 text-sm text-zinc-500">Poucas escolhas, com intenção.</p>
                </div>
                <div className="space-y-3">
                  {workspace.priorities.map((priority, index) => (
                    <div
                      key={priority.id}
                      className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                    >
                      <button
                        aria-label={`Concluir prioridade ${index + 1}`}
                        onClick={() =>
                          updateWorkspace((current) => ({
                            ...current,
                            priorities: current.priorities.map((item) =>
                              item.id === priority.id ? { ...item, done: !item.done } : item,
                            ),
                          }))
                        }
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${priority.done ? "border-emerald-500 bg-emerald-500 text-zinc-950" : "border-zinc-700 bg-zinc-900 text-transparent"}`}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <span className="w-5 text-xs font-semibold text-zinc-600">{index + 1}</span>
                      <input
                        value={priority.text}
                        maxLength={180}
                        onChange={(event) =>
                          updateWorkspace((current) => ({
                            ...current,
                            priorities: current.priorities.map((item) =>
                              item.id === priority.id
                                ? { ...item, text: event.target.value }
                                : item,
                            ),
                          }))
                        }
                        placeholder="Digite uma prioridade"
                        className={`min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600 ${priority.done ? "text-zinc-500 line-through" : "text-zinc-200"}`}
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Metas</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      Acompanhe o avanço sem perder o contexto.
                    </p>
                  </div>
                  <button
                    onClick={addGoal}
                    disabled={workspace.goals.length >= 8}
                    className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                    Nova meta
                  </button>
                </div>

                {workspace.goals.length === 0 ? (
                  <button
                    onClick={addGoal}
                    className="flex min-h-40 w-full flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 text-zinc-500 hover:border-blue-700 hover:text-blue-400"
                  >
                    <Target className="mb-3 h-7 w-7" />
                    <span className="text-sm">Adicione sua primeira meta</span>
                  </button>
                ) : (
                  <div className="space-y-4">
                    {workspace.goals.map((goal) => (
                      <div
                        key={goal.id}
                        className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
                      >
                        <div className="flex items-start gap-3">
                          <input
                            value={goal.title}
                            maxLength={180}
                            onChange={(event) =>
                              updateWorkspace((current) => ({
                                ...current,
                                goals: current.goals.map((item) =>
                                  item.id === goal.id
                                    ? { ...item, title: event.target.value }
                                    : item,
                                ),
                              }))
                            }
                            placeholder="Nome da meta"
                            className="min-w-0 flex-1 bg-transparent font-medium text-zinc-100 outline-none placeholder:text-zinc-600"
                          />
                          <button
                            aria-label="Excluir meta"
                            onClick={() =>
                              updateWorkspace((current) => ({
                                ...current,
                                goals: current.goals.filter((item) => item.id !== goal.id),
                              }))
                            }
                            className="p-1 text-zinc-600 hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={goal.progress}
                            onChange={(event) =>
                              updateWorkspace((current) => ({
                                ...current,
                                goals: current.goals.map((item) =>
                                  item.id === goal.id
                                    ? { ...item, progress: Number(event.target.value) }
                                    : item,
                                ),
                              }))
                            }
                            className="h-2 min-w-0 flex-1 cursor-pointer accent-blue-500"
                          />
                          <span className="w-10 text-right text-xs font-medium text-blue-400">
                            {goal.progress}%
                          </span>
                        </div>
                        <Progress
                          value={goal.progress}
                          className="mt-3 bg-zinc-800"
                          indicatorClassName="bg-gradient-to-r from-fuchsia-500 to-blue-500"
                        />
                        <label className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
                          <CalendarDays className="h-4 w-4" />
                          Prazo
                          <input
                            type="date"
                            value={goal.dueDate}
                            onChange={(event) =>
                              updateWorkspace((current) => ({
                                ...current,
                                goals: current.goals.map((item) =>
                                  item.id === goal.id
                                    ? { ...item, dueDate: event.target.value }
                                    : item,
                                ),
                              }))
                            }
                            className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-300 outline-none"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
              <div className="mb-4 flex items-center gap-2">
                <NotebookPen className="h-5 w-5 text-fuchsia-400" />
                <div>
                  <h2 className="text-lg font-semibold">Anotações rápidas</h2>
                  <p className="text-sm text-zinc-500">Tire da cabeça antes que se perca.</p>
                </div>
              </div>
              <textarea
                value={workspace.notes}
                maxLength={20000}
                onChange={(event) =>
                  updateWorkspace((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Ideias, lembretes, decisões e qualquer coisa que você precise reencontrar depois..."
                className="min-h-56 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm leading-6 text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-blue-800"
              />
            </section>
              </div>
            </details>
          </div>
        </div>
      </main>
    </div>
  );
}

type Accent = "blue" | "violet" | "emerald" | "amber" | "pink";

const quickLinkStyles: Record<Accent, string> = {
  blue: "border-blue-500/20 bg-blue-500/5 text-blue-300 hover:border-blue-500/50",
  violet: "border-violet-500/20 bg-violet-500/5 text-violet-300 hover:border-violet-500/50",
  emerald:
    "border-emerald-500/20 bg-emerald-500/5 text-emerald-300 hover:border-emerald-500/50",
  amber: "border-amber-500/20 bg-amber-500/5 text-amber-300 hover:border-amber-500/50",
  pink: "border-pink-500/20 bg-pink-500/5 text-pink-300 hover:border-pink-500/50",
};

function QuickLink({
  href,
  icon,
  title,
  description,
  accent,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  accent: Accent;
}) {
  return (
    <a
      href={href}
      className={`group flex items-center gap-3 rounded-xl border p-4 transition hover:-translate-y-0.5 ${quickLinkStyles[accent]}`}
    >
      <span className="rounded-lg bg-zinc-950/60 p-2.5 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold text-zinc-100">{title}</span>
        <span className="block truncate text-xs text-zinc-500">{description}</span>
      </span>
      <ArrowRight className="ml-auto h-4 w-4 shrink-0 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
    </a>
  );
}

type MetricTone = "orange" | "blue" | "cyan" | "violet" | "amber" | "emerald";

const metricToneStyles: Record<MetricTone, string> = {
  orange: "border-orange-500/20 bg-orange-500/5 text-orange-300",
  blue: "border-blue-500/20 bg-blue-500/5 text-blue-300",
  cyan: "border-cyan-500/20 bg-cyan-500/5 text-cyan-300",
  violet: "border-violet-500/20 bg-violet-500/5 text-violet-300",
  amber: "border-amber-500/20 bg-amber-500/5 text-amber-300",
  emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
};

function MetricCard({ label, value, tone }: { label: string; value: number; tone: MetricTone }) {
  return (
    <div className={`rounded-xl border px-3 py-4 text-center ${metricToneStyles[tone]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-zinc-400">{label}</p>
    </div>
  );
}

type ValueTone = "emerald" | "blue" | "red" | "zinc";

const valueToneStyles: Record<ValueTone, string> = {
  emerald: "text-emerald-400",
  blue: "text-blue-400",
  red: "text-red-400",
  zinc: "text-zinc-100",
};

function ValueCard({ label, value, tone }: { label: string; value: string; tone: ValueTone }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-2 text-xl font-bold ${valueToneStyles[tone]}`}>{value}</p>
    </div>
  );
}

function OperationCard({
  title,
  icon,
  href,
  loading,
  rows,
}: {
  title: string;
  icon: ReactNode;
  href: string;
  loading: boolean;
  rows: Array<[string, number]>;
}) {
  return (
    <a
      href={href}
      className="group rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 transition hover:border-fuchsia-500/40"
    >
      <div className="mb-4 flex items-center gap-2 text-zinc-200">
        <span className="text-fuchsia-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
        <ArrowRight className="ml-auto h-4 w-4 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-fuchsia-300" />
      </div>
      {loading ? (
        <div className="flex min-h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-zinc-500">{label}</span>
              <span className="font-semibold text-zinc-200">{value}</span>
            </div>
          ))}
        </div>
      )}
    </a>
  );
}

function LoadingBlock() {
  return (
    <div className="flex min-h-24 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40">
      <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
    </div>
  );
}

function UnavailableBlock({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-6 text-center text-sm text-zinc-500">
      {label}
    </div>
  );
}
