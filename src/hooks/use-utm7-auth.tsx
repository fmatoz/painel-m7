import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
type UtmSession = {
  user: { id: string; email: string; full_name: string; active: boolean; is_admin: boolean };
  expires_at: string;
};
export function useUtm7Auth() {
  const [session, setSession] = useState<UtmSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const qc = useQueryClient();
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/utm7/session", { credentials: "same-origin", cache: "no-store" });
      const p = await r.json();
      if (r.ok && p.ok) {
        setSession(p.data);
        setError("");
      } else if (r.status === 401) {
        setSession(null);
        setError("");
      } else setError("Não foi possível verificar seu acesso. Tente novamente.");
    } catch {
      setError("Não foi possível conectar ao UTM7. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const expired = () => {
      setSession(null);
      qc.removeQueries({ queryKey: ["utm7"] });
    };
    window.addEventListener("utm7:session-expired", expired);
    return () => window.removeEventListener("utm7:session-expired", expired);
  }, [refresh, qc]);
  const login = async (fields: Record<string, string>) => {
    const r = await fetch("/api/utm7/auth", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const p = await r.json();
    if (!r.ok || !p.ok) throw Error(p.error || "Não foi possível entrar.");
    qc.removeQueries({ queryKey: ["utm7"] });
    setSession(p.data);
    setError("");
  };
  const signOut = async () => {
    try {
      const r = await fetch("/api/utm7/auth", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!r.ok) throw Error();
      setSession(null);
      qc.removeQueries({ queryKey: ["utm7"] });
    } catch {
      setError("Não foi possível sair. Tente novamente.");
    }
  };
  return {
    session,
    user: session?.user,
    profile: session?.user,
    loading,
    error,
    refresh,
    login,
    signOut,
  };
}

export function Utm7Login({
  login,
  error: serviceError,
  refresh,
}: {
  login: (p: Record<string, string>) => Promise<void>;
  error: string;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [activation, setActivation] = useState("");
  useEffect(() => {
    const m = window.location.hash.match(/^#ativar=([a-f0-9]{64})$/);
    if (m) {
      setActivation(m[1]);
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);
  return (
    <div className="utm7-app u-auth-page" data-u-theme="dark">
      <form
        className="u-auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError("");
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await login({
              action: activation ? "activate" : "login",
              email: String(f.get("email") || ""),
              password: String(f.get("password") || ""),
              activation_token: activation,
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Não foi possível entrar.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="u-auth-logo">
          utm<span>7</span>
        </div>
        <h1>{activation ? "Defina seu acesso" : "Bem-vindo ao UTM7"}</h1>
        <p>Suas ofertas, campanhas e resultados em um só lugar.</p>
        {!activation && (
          <label>
            E-mail
            <input name="email" type="email" autoComplete="username" maxLength={254} required />
          </label>
        )}
        <label>
          {activation ? "Nova senha" : "Senha"}
          <input
            name="password"
            type="password"
            autoComplete={activation ? "new-password" : "current-password"}
            minLength={activation ? 12 : 1}
            maxLength={128}
            required
          />
        </label>
        {(error || serviceError) && (
          <p className="u-auth-error" role="alert">
            {error || serviceError}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? "Entrando…" : activation ? "Ativar acesso" : "Entrar"}
        </button>
        {serviceError && (
          <button type="button" onClick={() => void refresh()}>
            Tentar conexão novamente
          </button>
        )}
        <a href="/login">Acessar Painel M7</a>
      </form>
    </div>
  );
}

