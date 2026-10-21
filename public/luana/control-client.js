export const CONTROL_API = "https://projetopessoal-n8n.h574he.easypanel.host/webhook/canel/luana-control";

export function tokenFromLink(location, storage) {
  const value = new URLSearchParams(location.hash.slice(1)).get("chave");
  if (value && /^[A-Za-z0-9_-]{43}$/.test(value)) {
    try { storage.setItem("canel-luana-key", value); } catch {}
    return value;
  }
  if (value !== null) return null;
  try {
    const saved = storage.getItem("canel-luana-key");
    return saved && /^[A-Za-z0-9_-]{43}$/.test(saved) ? saved : null;
  } catch { return null; }
}

export async function requestState(token, change, { fetcher = fetch, url = CONTROL_API } = {}) {
  if (!token) throw new Error("Abra o link privado enviado pela M7 para acessar este controle.");
  const request = { token, action: change ? "set" : "status", ...change };
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify(request),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    const message = response.status === 401 ? "Este link não é válido. Solicite um novo link à M7."
      : response.status === 409 ? "O estado mudou em outra janela. Atualize e tente novamente."
      : "Não foi possível confirmar o atendimento. Atualize antes de tentar novamente.";
    throw new Error(message);
  }
  if (typeof result.enabled !== "boolean" || !Number.isSafeInteger(result.version)
    || result.version < 1 || typeof result.updatedAt !== "string" || !Number.isFinite(Date.parse(result.updatedAt))) {
    throw new Error("O servidor não confirmou um estado válido. Tente atualizar.");
  }
  return { enabled: result.enabled, version: result.version, updatedAt: result.updatedAt };
}
