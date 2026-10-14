const FINANCE_DELETE_URL =
  "https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-finance/delete-session";

export async function deleteFinancialEntry(token: string, id: string) {
  if (!token) throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch(FINANCE_DELETE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    cache: "no-store",
    body: JSON.stringify({ token, id }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true || data.id !== id) {
    throw new Error(
      data?.error ||
        "O servidor não confirmou a exclusão. Atualize a lista antes de tentar novamente.",
    );
  }
  return data as { ok: true; id: string };
}
