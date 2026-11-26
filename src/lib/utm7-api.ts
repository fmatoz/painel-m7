const API = "/api/utm7/data";
export async function utm7Api<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(payload.action === "sync_meta" ? 120000 : 45000),
  });
  let result: { ok?: boolean; data?: T; error?: string };
  try {
    result = await response.json();
  } catch {
    throw new Error("O UTM7 não respondeu. Tente novamente em instantes.");
  }
  if (response.status === 401) window.dispatchEvent(new Event("utm7:session-expired"));
  if (!response.ok || !result.ok)
    throw new Error(result.error || `Não foi possível concluir (${response.status}).`);
  return result.data as T;
}

