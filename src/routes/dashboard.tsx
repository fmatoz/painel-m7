import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Search,
  Menu,
  RefreshCw,
  X,
  Power,
  PowerOff,
  LogOut,
  Loader2,
  Trash2,
  Tag,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import logoAsset from "@/assets/logo-v2.png.asset.json";

type Workflow = {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
};

type ConfirmDialogState = {
  isOpen: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  variant: "default" | "destructive";
};

type CreateTabDialogState = {
  isOpen: boolean;
  name: string;
};

export const Route = createFileRoute("/dashboard")({
  component: DashboardComponent,
});

function DashboardComponent() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [customTabs, setCustomTabs] = useState<{ id: string; name: string }[]>(() => {
    const saved = localStorage.getItem("dashboard_tabs");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Filtrar "prospecção" se ainda existir no localStorage
        return parsed.filter((tab: any) => tab.id !== "prospecção");
      } catch (e) {
        console.error("Error parsing dashboard_tabs", e);
      }
    }
    return [
      { id: "todos", name: "Todos" },
      { id: "favoritos", name: "Favoritos" }
    ];
  });
  const [filter, setFilter] = useState<string>("todos");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: "",
    description: "",
    onConfirm: () => {},
    variant: "default",
  });
  const [createTabDialog, setCreateTabDialog] = useState<CreateTabDialogState>({
    isOpen: false,
    name: "",
  });
  
  useEffect(() => {
    // Filtrar abas duplicadas ou indesejadas que possam vir do localStorage antigo
    const uniqueTabs = customTabs.filter((tab, index, self) => 
      index === self.findIndex((t) => t.id === tab.id)
    );
    if (uniqueTabs.length !== customTabs.length) {
      setCustomTabs(uniqueTabs);
    }
    localStorage.setItem("dashboard_tabs", JSON.stringify(uniqueTabs));
  }, [customTabs]);
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();
  const { user, session, loading: authLoading, signOut } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!authLoading && !session) {
      navigate({ to: "/login", search: {} as any });
    }
  }, [session, authLoading, navigate]);

  useEffect(() => {
    if (session) {
      const runDiagnose = async () => {
        try {
          const { data, error } = await supabase.functions.invoke("n8n-workflows", {
            body: { action: "diagnose" },
          });
          console.log("DIAGNOSIS_RESULT:", JSON.stringify(data || error));
        } catch (e) {
          console.error("DIAGNOSIS_EXCEPTION:", e);
        }
      };
      runDiagnose();
    }
  }, [session]);

  const { data: workflows = [], isLoading, error, refetch } = useQuery({
    queryKey: ["n8n-workflows"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("n8n-workflows", {
          body: { action: "list" },
        });
      
      if (error) {
        if (error.status === 401) {
          await signOut();
          navigate({ to: "/login", search: {} as any });
        }
        throw error;
      }
      // O n8n retorna tags como objetos ({ id, name, ... }); normalizamos para string[]
      const raw = (data.data ?? []) as Array<Record<string, unknown>>;
      return raw.map((wf) => ({
        ...wf,
        tags: Array.isArray(wf.tags)
          ? (wf.tags as unknown[])
              .map((t) =>
                typeof t === "string" ? t : ((t as { name?: string } | null)?.name ?? "")
              )
              .filter((t): t is string => t.length > 0)
          : [],
      })) as Workflow[];
    },
    enabled: !!session,
    retry: false,
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { data, error } = await supabase.functions.invoke("n8n-workflows", {
        body: { 
          action: "toggle",
          workflowId: id,
          active: active
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["n8n-workflows"] });
    },
  });

  const updateTagMutation = useMutation({
    mutationFn: async ({ id, tag }: { id: string; tag: string }) => {
      const { data, error } = await supabase.functions.invoke("n8n-workflows", {
        body: { 
          action: "update-tag",
          workflowId: id,
          tag: tag
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["n8n-workflows"] });
    },
  });

  if (authLoading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login", search: {} as any });
  };

  const filteredWorkflows = workflows.filter((wf) => {
    const matchesFilter =
      filter === "todos" ? true :
      filter === "ativo" ? wf.active :
      filter === "inativo" ? !wf.active :
      (wf.tags?.some(tag => {
        // Normalização rigorosa para comparação: trim e lowercase
        const normalizedTag = tag.trim().toLowerCase();
        const normalizedFilter = filter.trim().toLowerCase();
        return normalizedTag === normalizedFilter;
      }) ?? false);
    const matchesSearch = wf.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const stats = {
    total: workflows.length,
    ativos: workflows.filter((w) => w.active).length,
    inativos: workflows.filter((w) => !w.active).length,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-white">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-zinc-900 border-r border-zinc-800 transition-transform lg:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-zinc-800">
          <img src={logoAsset.url} alt="Logo" className="h-10 object-contain" />
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden">
            <X className="w-6 h-6 text-zinc-400" />
          </button>
        </div>
          <nav className="p-4 space-y-2">
            <a href="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800 text-white">
              <LayoutDashboard className="w-5 h-5" />
              Workflows
            </a>
            <a href="/financeiro" className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white">
              <LayoutDashboard className="w-5 h-5" />
              Financeiro
            </a>
          </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:pl-64 flex flex-col h-full min-w-0">
        <header className="sticky top-0 h-16 flex items-center justify-between px-6 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800">
          <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden">
            <Menu className="w-6 h-6 text-zinc-400" />
          </button>
          <div className="flex items-center gap-4 ml-auto">
            <span className="text-sm text-zinc-400">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold">Painel de Automações</h1>
              <button
                onClick={() => refetch()}
                className="p-2 text-zinc-400 hover:text-white transition-colors"
                title="Atualizar lista"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
            <Button
              onClick={() => setCreateTabDialog({ isOpen: true, name: "" })}
              variant="outline"
              className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-white"
            >
              + Nova Aba
            </Button>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            {[
              { label: "Total", value: stats.total },
              { label: "Ativos", value: stats.ativos },
              { label: "Inativos", value: stats.inativos },
            ].map((card) => (
              <div key={card.label} className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl shadow-sm">
                <p className="text-sm text-zinc-400">{card.label}</p>
                <p className="text-3xl font-bold mt-2">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-3 h-5 w-5 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar workflow..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-11 rounded-lg border border-zinc-700 bg-zinc-900 pl-11 pr-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              {customTabs.map((tab) => (
                <div key={tab.id} className="relative group">
                  <button
                    onClick={() => setFilter(tab.id)}
                    className={`px-4 py-2 rounded-lg text-sm capitalize flex items-center gap-2 ${
                      filter === tab.id
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    {tab.name}
                  </button>
                  {!["todos", "favoritos", "prospecção"].includes(tab.id) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDialog({
                          isOpen: true,
                          title: "Excluir Aba",
                          description: `Tem certeza que deseja excluir a aba "${tab.name}"?`,
                          onConfirm: () => {
                            setCustomTabs(customTabs.filter((t) => t.id !== tab.id));
                            if (filter === tab.id) setFilter("todos");
                            setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                          },
                          variant: "destructive",
                        });
                      }}
                      className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden relative min-h-[200px]">
            {isLoading ? (
              <div className="p-10 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 w-full bg-zinc-800 animate-pulse rounded" />
                ))}
              </div>
            ) : error ? (
              <div className="p-10 text-center space-y-4">
                <p className="text-red-400">
                  {(error as any).status === 403 
                    ? "Usuário não autorizado para gerenciar workflows" 
                    : "Falha ao carregar workflows do n8n"}
                </p>
                <button
                  onClick={() => refetch()}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
                >
                  Tentar corrigir tudo
                </button>
              </div>
            ) : filteredWorkflows.length === 0 ? (
              <div className="p-10 text-center text-zinc-500">
                Nenhum workflow encontrado. Verifique suas abas e filtros.
              </div>
            ) : (
              <>
                {/* Desktop View Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-sm text-zinc-400">
                    <thead className="bg-zinc-800 text-zinc-200">
                      <tr>
                        <th className="px-6 py-4">Nome</th>
                        <th className="px-6 py-4">ID</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Aba</th>
                        <th className="px-6 py-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {filteredWorkflows.map((wf) => (
                        <tr key={wf.id} className="hover:bg-zinc-800/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-white">{wf.name}</td>
                          <td className="px-6 py-4 text-xs font-mono">{wf.id}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${wf.active ? "bg-green-950 text-green-400" : "bg-zinc-800 text-zinc-400"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${wf.active ? "bg-green-500" : "bg-zinc-500"}`} />
                              {wf.active ? "ativo" : "inativo"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 px-2 text-zinc-400 hover:text-white">
                                  <Tag className="w-4 h-4 mr-2" />
                                  {wf.tags?.[0] || "Sem aba"}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-800 text-zinc-300">
                                {customTabs
                                  .filter((t) => !["todos", "ativo", "inativo"].includes(t.id))
                                  .map((tab) => (
                                    <DropdownMenuItem
                                      key={tab.id}
                                      onClick={() => {
                                        updateTagMutation.mutate({ id: wf.id, tag: tab.name });
                                      }}
                                      className="hover:bg-zinc-800 cursor-pointer"
                                    >
                                      {tab.name}
                                    </DropdownMenuItem>
                                  ))}
                                <DropdownMenuItem
                                  onClick={() => {
                                    updateTagMutation.mutate({ id: wf.id, tag: "" });
                                  }}
                                  className="hover:bg-zinc-800 cursor-pointer text-zinc-500"
                                >
                                  Remover Aba
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => {
                                setConfirmDialog({
                                  isOpen: true,
                                  title: wf.active ? "Desativar Workflow" : "Ativar Workflow",
                                  description: `Tem certeza que deseja ${wf.active ? "desativar" : "ativar"} o workflow "${wf.name}"?`,
                                  onConfirm: () => {
                                    toggleStatusMutation.mutate({ id: wf.id, active: !wf.active });
                                    setConfirmDialog({ ...confirmDialog, isOpen: false });
                                  },
                                  variant: wf.active ? "destructive" : "default",
                                });
                              }}
                              disabled={toggleStatusMutation.isPending}
                              className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                                wf.active 
                                  ? "bg-zinc-800 hover:bg-red-900/30 text-zinc-400 hover:text-red-400" 
                                  : "bg-green-600/10 hover:bg-green-600/20 text-green-500"
                              }`}
                            >
                              {toggleStatusMutation.isPending && toggleStatusMutation.variables?.id === wf.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : wf.active ? (
                                <><PowerOff className="w-3.5 h-3.5" /> Desativar</>
                              ) : (
                                <><Power className="w-3.5 h-3.5" /> Ativar</>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View Cards */}
                <div className="md:hidden divide-y divide-zinc-800">
                  {filteredWorkflows.map((wf) => (
                    <div key={wf.id} className="p-4 space-y-3">
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1 min-w-0">
                          <p className="font-medium text-white truncate">{wf.name}</p>
                          <p className="text-[10px] font-mono text-zinc-500 truncate">{wf.id}</p>
                        </div>
                        <span className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${wf.active ? "bg-green-950 text-green-400" : "bg-zinc-800 text-zinc-400"}`}>
                          <span className={`w-1 h-1 rounded-full ${wf.active ? "bg-green-500" : "bg-zinc-500"}`} />
                          {wf.active ? "ativo" : "inativo"}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between pt-1 gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-400 h-10">
                              <Tag className="w-4 h-4 mr-2" />
                              {wf.tags?.[0] || "Aba"}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-800 text-zinc-300">
                            {customTabs
                              .filter((t) => !["todos", "ativo", "inativo"].includes(t.id))
                              .map((tab) => (
                                <DropdownMenuItem
                                  key={tab.id}
                                  onClick={() => {
                                    updateTagMutation.mutate({ id: wf.id, tag: tab.name });
                                  }}
                                  className="hover:bg-zinc-800 cursor-pointer"
                                >
                                  {tab.name}
                                </DropdownMenuItem>
                              ))}
                            <DropdownMenuItem
                              onClick={() => {
                                updateTagMutation.mutate({ id: wf.id, tag: "" });
                              }}
                              className="hover:bg-zinc-800 cursor-pointer text-zinc-500"
                            >
                              Remover Aba
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <button 
                          onClick={() => {
                            setConfirmDialog({
                              isOpen: true,
                              title: wf.active ? "Desativar Workflow" : "Ativar Workflow",
                              description: `Tem certeza que deseja ${wf.active ? "desativar" : "ativar"} o workflow "${wf.name}"?`,
                              onConfirm: () => {
                                toggleStatusMutation.mutate({ id: wf.id, active: !wf.active });
                                setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                              },
                              variant: wf.active ? "destructive" : "default",
                            });
                          }}
                          disabled={toggleStatusMutation.isPending}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 h-10 ${
                            wf.active 
                              ? "bg-zinc-800 text-zinc-400 active:bg-red-900/30 active:text-red-400" 
                              : "bg-green-600/10 text-green-500 active:bg-green-600/20"
                          }`}
                        >
                          {toggleStatusMutation.isPending && toggleStatusMutation.variables?.id === wf.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : wf.active ? (
                            <><PowerOff className="w-4 h-4" /> Off</>
                          ) : (
                            <><Power className="w-4 h-4" /> On</>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmDialog.variant === "destructive" ? (
                <AlertCircle className="w-5 h-5 text-red-500" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-blue-500" />
              )}
              {confirmDialog.title}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {confirmDialog.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              Cancelar
            </Button>
            <Button
              variant={confirmDialog.variant === "destructive" ? "destructive" : "default"}
              onClick={confirmDialog.onConfirm}
              className={confirmDialog.variant === "default" ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Tab Dialog */}
      <Dialog open={createTabDialog.isOpen} onOpenChange={(open) => setCreateTabDialog(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Criar Nova Aba</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Digite o nome para a nova aba de organização.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input
              type="text"
              placeholder="Nome da aba..."
              value={createTabDialog.name}
              onChange={(e) => setCreateTabDialog(prev => ({ ...prev, name: e.target.value }))}
              className="w-full h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && createTabDialog.name.trim()) {
                  const name = createTabDialog.name.trim();
                  if (!customTabs.find(t => t.id === name.toLowerCase())) {
                    setCustomTabs([...customTabs, { id: name.toLowerCase(), name }]);
                  }
                  setCreateTabDialog({ isOpen: false, name: "" });
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCreateTabDialog({ isOpen: false, name: "" })}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              Cancelar
            </Button>
            <Button
              disabled={!createTabDialog.name.trim()}
              onClick={() => {
                const name = createTabDialog.name.trim();
                if (!customTabs.find(t => t.id === name.toLowerCase())) {
                  setCustomTabs([...customTabs, { id: name.toLowerCase(), name }]);
                }
                setCreateTabDialog({ isOpen: false, name: "" });
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Criar Aba
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
