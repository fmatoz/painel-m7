const CRM_API_URL = "https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-crm/api";

export async function crmApi<T>(token: string, payload: Record<string, unknown>): Promise<T> {
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
