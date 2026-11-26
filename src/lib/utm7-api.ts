const API = "https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-utm7/api";
export async function utm7Api<T>(token: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    cache: "no-store",
    body: JSON.stringify({ ...payload, token }),
    signal: AbortSignal.timeout(payload.action === "sync_meta" ? 120000 : 45000),
  });
  let result: { ok?: boolean; data?: T; error?: string };
  try {
    result = await response.json();
  } catch {
    throw new Error("O UTM7 não respondeu. Tente novamente em instantes.");
  }
  if (!response.ok || !result.ok)
    throw new Error(result.error || `Não foi possível concluir (${response.status}).`);
  return result.data as T;
}
