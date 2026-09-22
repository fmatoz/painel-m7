const SALES_API_URL = "https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-sales/api";

export async function salesApi<T>(token: string, payload: Record<string, unknown>): Promise<T> {
  if (!token) throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch(SALES_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    cache: "no-store",
    body: JSON.stringify({ ...payload, token }),
  });
  if (!response.ok) throw new Error(`Serviço de vendas indisponível (${response.status}).`);
  const result = (await response.json()) as { ok?: boolean; data?: T; error?: string };
  if (!result.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
  return result.data as T;
}
