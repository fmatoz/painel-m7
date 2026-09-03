import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  Cloud,
  CloudAlert,
  Home,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  NotebookPen,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Progress } from "@/components/ui/progress";

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
  const { user, session, loading: authLoading, signOut } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [workspace, setWorkspace] = useState<HomeWorkspace>(emptyWorkspace);
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!authLoading && !session) {
      navigate({ to: "/login", search: { next: undefined } });
    }
  }, [authLoading, navigate, session]);

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

  const today = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

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

  if (authLoading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-white">
      {isSidebarOpen && (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-zinc-800 bg-zinc-900 transition-transform lg:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-zinc-800 px-6">
          <img src="/logo-v2.png" alt="Logo Gestão M7 IA" className="h-10 object-contain" />
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-6 w-6 text-zinc-400" />
          </button>
        </div>
        <nav className="space-y-2 p-4">
          <a
            href="/inicio"
            className="flex items-center gap-3 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white"
          >
            <Home className="h-5 w-5" />
            Início
          </a>
          <a
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg px-4 py-3 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <LayoutDashboard className="h-5 w-5" />
            Workflows
          </a>
          <a
            href="/crm"
            className="flex items-center gap-3 rounded-lg px-4 py-3 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <LayoutDashboard className="h-5 w-5" />
            CRM
          </a>
          <a
            href="/financeiro"
            className="flex items-center gap-3 rounded-lg px-4 py-3 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <TrendingUp className="h-5 w-5" />
            Financeiro
          </a>
        </nav>
      </aside>

      <main className="flex h-full min-w-0 flex-1 flex-col lg:pl-64">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/85 px-4 backdrop-blur md:px-6">
          <button
            onClick={() => setIsSidebarOpen(true)}
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
            <section className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm capitalize text-zinc-500">
                  <CalendarDays className="h-4 w-4" />
                  {today}
                </p>
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                  Seu ponto de partida
                </h1>
                <p className="mt-2 text-zinc-400">
                  Escolha o essencial e comece sem precisar decidir tudo de uma vez.
                </p>
              </div>
              <div className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-400">
                {completedPriorities} de 3 prioridades concluídas
              </div>
            </section>

            {loadError && (
              <div className="rounded-xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                {loadError}
              </div>
            )}

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
        </div>
      </main>
    </div>
  );
}
