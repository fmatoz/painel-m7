export function verifyBudget(live, request, connection) {
  const fail = (error, status = 409) => ({ ok: false, status, error });
  if (request.confirmed !== true) return fail("Confirme a alteração antes de enviar.", 400);
  if (
    !Number.isInteger(request.new_budget_minor) ||
    request.new_budget_minor < 100 ||
    request.new_budget_minor > 1000000
  )
    return fail("Orçamento diário inválido.", 400);
  if (live.error)
    return fail(
      "Meta: " +
        String(live.error.message || "Não foi possível consultar o orçamento.").slice(0, 300),
      502,
    );
  if (
    String(live.id) !== String(request.adset_id) ||
    String(live.account_id) !== String(connection.account_id)
  )
    return fail("O conjunto não pertence à conta selecionada.", 403);
  if (
    !Number(live.daily_budget) ||
    Number(live.lifetime_budget) > 0 ||
    Number(live.campaign?.daily_budget) > 0 ||
    Number(live.campaign?.lifetime_budget) > 0
  )
    return fail("A edição está disponível para orçamento diário no conjunto (ABO).");
  if (Number(live.daily_budget) !== Number(request.expected_budget_minor))
    return fail("O orçamento mudou na Meta. Sincronize e confirme o novo valor novamente.");
  return { ok: true };
}
