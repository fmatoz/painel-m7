import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Typed wrapper for the beta supabase.auth.oauth namespace.
type AuthorizationDetails = {
  client?: { name?: string; client_id?: string; redirect_uris?: string[] } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
  scope?: string | null;
  scopes?: string[] | null;
};

type OAuthResult<T> = { data: T | null; error: { message: string } | null };

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult<AuthorizationDetails>>;
  approveAuthorization: (id: string) => Promise<OAuthResult<{ redirect_url?: string; redirect_to?: string }>>;
  denyAuthorization: (id: string) => Promise<OAuthResult<{ redirect_url?: string; redirect_to?: string }>>;
};

function getOAuthApi(): OAuthApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase.auth as any).oauth as OAuthApi;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) {
      throw new Error("Missing authorization_id");
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await getOAuthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      throw redirect({ href: immediate });
    }
    return data;
  },
  component: ConsentComponent,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="max-w-md w-full rounded-2xl bg-zinc-900 border border-zinc-800 p-8 text-center">
        <h1 className="text-xl font-semibold text-white">Não foi possível carregar a autorização</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {String((error as Error)?.message ?? error)}
        </p>
      </div>
    </div>
  ),
});

function ConsentComponent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "deny");
    setError(null);
    const api = getOAuthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(null);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(null);
      setError("Nenhum redirect retornado pelo servidor de autorização.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "Este aplicativo";
  const scopes =
    details?.scopes ??
    (details?.scope ? details.scope.split(/\s+/).filter(Boolean) : []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="max-w-md w-full space-y-6 rounded-2xl bg-zinc-900 border border-zinc-800 p-8 shadow-2xl">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-white">
            Conectar {clientName} ao Painel de Automações
          </h1>
          <p className="text-sm text-zinc-400">
            {clientName} poderá usar as ferramentas deste app agindo como você.
            Isso não contorna as políticas de acesso do backend.
          </p>
        </div>

        {scopes.length > 0 && (
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Permissões solicitadas</p>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {scopes.map((s: string) => (
                <li key={s}>• {s}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div role="alert" className="p-3 rounded-md bg-red-950/50 border border-red-900 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={() => decide(true)}
            disabled={busy !== null}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aprovar"}
          </button>
          <button
            onClick={() => decide(false)}
            disabled={busy !== null}
            className="inline-flex h-10 w-full items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === "deny" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cancelar conexão"}
          </button>
        </div>
      </div>
    </div>
  );
}
