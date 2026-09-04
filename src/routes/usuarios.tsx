import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Menu, Plus, ShieldCheck, UserRound } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSidebar } from "@/hooks/use-app-sidebar";
import { useAppAccess, type AppUser } from "@/hooks/use-access";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/usuarios")({ component: UsuariosComponent });

type Permissions = Pick<AppUser, "can_inicio" | "can_workflows" | "can_crm" | "can_financeiro">;

const permissionOptions: { key: keyof Permissions; label: string }[] = [
  { key: "can_inicio", label: "Início" },
  { key: "can_workflows", label: "Workflows" },
  { key: "can_crm", label: "CRM" },
  { key: "can_financeiro", label: "Financeiro" },
];

function UsuariosComponent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, session, loading: authLoading, signOut } = useAuth();
  const access = useAppAccess();
  const sidebar = useAppSidebar();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<Permissions>({
    can_inicio: true,
    can_workflows: false,
    can_crm: true,
    can_financeiro: false,
  });

  useEffect(() => {
    if (!authLoading && !session) navigate({ to: "/login", search: { next: "/usuarios" } });
  }, [authLoading, session, navigate]);
  useEffect(() => {
    if (!access.loading && session && !access.can("usuarios")) {
      navigate({ to: access.firstAllowedPath as "/inicio" });
    }
  }, [access, session, navigate]);

  const usersQuery = useQuery({
    queryKey: ["app-users"],
    enabled: access.can("usuarios"),
    queryFn: async () => {
      const { data, error } = await supabase.from("app_users").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const createUser = useMutation({
    mutationFn: async () => {
      const cleanEmail = email.trim().toLowerCase();
      if (!fullName.trim() || !cleanEmail || password.length < 6) {
        throw new Error("Informe nome, e-mail e uma senha com pelo menos 6 caracteres.");
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
        method: "POST",
        headers: { apikey: publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          data: { full_name: fullName.trim() },
        }),
      });
      const authResult = await response.json();
      if (!response.ok || !authResult.user?.id) {
        throw new Error(authResult.msg || authResult.message || "Não foi possível criar o login.");
      }
      const { error } = await supabase.from("app_users").insert({
        user_id: authResult.user.id,
        email: cleanEmail,
        full_name: fullName.trim(),
        ...permissions,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Usuário criado com os acessos escolhidos.");
      setFullName("");
      setEmail("");
      setPassword("");
      queryClient.invalidateQueries({ queryKey: ["app-users"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Erro ao criar usuário."),
  });

  const updateUser = useMutation({
    mutationFn: async ({ userId, changes }: { userId: string; changes: Partial<AppUser> }) => {
      const { error } = await supabase
        .from("app_users")
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app-users"] }),
    onError: () => toast.error("Não foi possível atualizar as permissões."),
  });

  if (authLoading || access.loading || !session || !access.can("usuarios")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-white">
      <AppSidebar active="usuarios" {...sidebar} />
      <main
        className={`flex h-full min-w-0 flex-1 flex-col transition-[padding] duration-200 ${sidebar.collapsed ? "lg:pl-20" : "lg:pl-64"}`}
      >
        <header className="flex h-16 shrink-0 items-center border-b border-zinc-800 px-4 md:px-6">
          <button
            onClick={() => sidebar.setMobileOpen(true)}
            className="lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-6 w-6 text-zinc-400" />
          </button>
          <div className="ml-4 lg:ml-0">
            <h1 className="font-bold">Usuários e acessos</h1>
            <p className="text-xs text-zinc-500">Área exclusiva do administrador</p>
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
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[380px_1fr]">
            <section className="h-fit rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/15 p-2 text-blue-300">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold">Novo usuário</h2>
                  <p className="text-xs text-zinc-500">Crie o login e escolha os acessos.</p>
                </div>
              </div>
              <div className="space-y-4">
                <label className="block text-xs text-zinc-400">
                  Nome
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1 border-zinc-700 bg-zinc-950"
                    placeholder="Nome da pessoa"
                  />
                </label>
                <label className="block text-xs text-zinc-400">
                  E-mail
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 border-zinc-700 bg-zinc-950"
                    placeholder="email@exemplo.com"
                  />
                </label>
                <label className="block text-xs text-zinc-400">
                  Senha inicial
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 border-zinc-700 bg-zinc-950"
                    placeholder="Mínimo de 6 caracteres"
                  />
                </label>
                <div>
                  <p className="mb-2 text-xs text-zinc-400">Permissões</p>
                  <div className="grid grid-cols-2 gap-2">
                    {permissionOptions.map((option) => (
                      <label
                        key={option.key}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={permissions[option.key]}
                          onChange={(e) =>
                            setPermissions((current) => ({
                              ...current,
                              [option.key]: e.target.checked,
                            }))
                          }
                          className="accent-blue-600"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
                <Button
                  onClick={() => createUser.mutate()}
                  disabled={createUser.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-500"
                >
                  {createUser.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Criar usuário
                </Button>
              </div>
            </section>
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="mb-5 flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
                <div>
                  <h2 className="font-semibold">Pessoas com acesso</h2>
                  <p className="text-xs text-zinc-500">As alterações são salvas automaticamente.</p>
                </div>
              </div>
              <div className="space-y-3">
                {usersQuery.isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                ) : (
                  usersQuery.data?.map((item) => {
                    const isOwner = item.user_id === user?.id;
                    return (
                      <div
                        key={item.user_id}
                        className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                      >
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="rounded-full bg-zinc-800 p-2">
                            <UserRound className="h-5 w-5 text-zinc-300" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-medium">{item.full_name || item.email}</p>
                              {item.is_admin && (
                                <span className="rounded bg-blue-500/15 px-2 py-0.5 text-[10px] text-blue-300">
                                  Administrador
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-zinc-500">{item.email}</p>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-zinc-400">
                            <input
                              type="checkbox"
                              checked={item.active}
                              disabled={isOwner}
                              onChange={(e) =>
                                updateUser.mutate({
                                  userId: item.user_id,
                                  changes: { active: e.target.checked },
                                })
                              }
                              className="accent-emerald-500"
                            />
                            Ativo
                          </label>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {permissionOptions.map((option) => (
                            <label
                              key={option.key}
                              className="flex items-center gap-2 rounded-lg border border-zinc-800 p-2 text-xs text-zinc-300"
                            >
                              <input
                                type="checkbox"
                                checked={item[option.key]}
                                disabled={isOwner || !item.active}
                                onChange={(e) =>
                                  updateUser.mutate({
                                    userId: item.user_id,
                                    changes: { [option.key]: e.target.checked },
                                  })
                                }
                                className="accent-blue-600"
                              />
                              {option.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
