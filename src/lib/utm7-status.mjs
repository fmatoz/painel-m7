export function verifyStatus(live, request, connection) {
  const fail = (error, status = 409) => ({ ok: false, status, error });
  if (
    request.confirmed !== true ||
    !["ACTIVE", "PAUSED"].includes(request.desired_status) ||
    !["campaign", "adset", "ad"].includes(request.level) ||
    !/^\d{5,30}$/.test(request.entity_id || "")
  )
    return fail("Confirme uma alteração de veiculação válida.", 400);
  if (live?.error || !live?.id)
    return fail(
      "Meta: " +
        String(live?.error?.message || "Não foi possível consultar a veiculação.").slice(0, 300),
      502,
    );
  if (
    String(live.id) !== request.entity_id ||
    String(live.account_id) !== String(connection.account_id)
  )
    return fail("O item não pertence à conta selecionada.", 403);
  if (!["ACTIVE", "PAUSED"].includes(live.status))
    return fail("Este item está arquivado, excluído ou indisponível para edição.");
  if (live.effective_status !== request.expected_status)
    return fail("A veiculação mudou na Meta. Sincronize e confirme novamente.");
  if (request.desired_status === "ACTIVE") {
    if (request.level !== "campaign" && live.campaign?.status !== "ACTIVE")
      return fail("Ative a campanha primeiro. A campanha está impedindo a veiculação deste item.");
    if (request.level === "ad" && live.adset?.status !== "ACTIVE")
      return fail(
        "Ative o conjunto primeiro. O conjunto está impedindo a veiculação deste anúncio.",
      );
  }
  return { ok: true, previous_status: live.status };
}
