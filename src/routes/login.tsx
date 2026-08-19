import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Lock, Mail, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  head: () => ({
    title: "Login | Painel de Automações",
    meta: [
      { name: "description", content: "Faça login no seu Painel de Automações" },
      { property: "og:title", content: "Login | Painel de Automações" },
    ],
  }),
  component: LoginComponent,
});

function safeNext(next: string | undefined): string | undefined {
  if (!next) return undefined;
  // Only allow same-origin relative paths.
  if (!next.startsWith("/") || next.startsWith("//")) return undefined;
  return next;
}

function LoginComponent() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const search = Route.useSearch();
  const nextTarget = safeNext(search.next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && session) {
      if (nextTarget) {
        window.location.href = nextTarget;
      } else {
        navigate({ to: "/inicio" });
      }
    }
  }, [session, authLoading, navigate, nextTarget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Por favor, preencha todos os campos.");
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        if (signInError.message === "Invalid login credentials") {
          setError("E-mail ou senha incorretos.");
        } else if (signInError.message === "Email not confirmed") {
          setError("Por favor, confirme seu e-mail antes de acessar.");
        } else if (signInError.status === 0 || signInError.message.includes("fetch")) {
          setError("Erro de conexão ou backend inacessível.");
        } else {
          setError("Não foi possível entrar. Tente novamente.");
        }
        return;
      }

      if (nextTarget) {
        window.location.href = nextTarget;
      } else {
        navigate({ to: "/inicio" });
      }
    } catch (err) {
      setError("Erro de conexão. Verifique sua internet.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-zinc-900 p-8 shadow-2xl border border-zinc-800">
        <div className="flex flex-col items-center space-y-2">
          <div className="w-24 h-24 mb-2">
            <img src="/logo-v2.png" alt="Gestão M7 IA" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Painel de Automações</h1>
          <p className="text-sm text-zinc-400">
            Acesso restrito à equipe autorizada da M7.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none text-zinc-300" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                <input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-800 px-10 py-2 text-sm text-white ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={email}
                  disabled={loading}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none text-zinc-300" htmlFor="password">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-800 px-10 py-2 text-sm text-white ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={password}
                  disabled={loading}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-red-950/50 border border-red-900 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
