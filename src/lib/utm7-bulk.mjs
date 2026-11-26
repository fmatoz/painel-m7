export function bulkBudgetTargets(rows, level, adsets) {
  if (level === "campaign")
    throw new Error("Selecione os conjuntos para editar o orçamento diário (ABO).");
  const ids = [...new Set(rows.map((r) => (level === "ad" ? r.adset_id : r.id)))];
  if (!ids.length || ids.length > 50) throw new Error("Selecione entre 1 e 50 itens.");
  return ids.map((id) => {
    const row = level === "ad" ? adsets.find((s) => s.id === id) : rows.find((s) => s.id === id);
    if (!row || !/^\d{5,30}$/.test(id) || !Number.isInteger(row.budgetMinor) || row.budgetMinor < 1)
      throw new Error(
        "Um conjunto não tem orçamento diário disponível. Sincronize a Meta ou selecione conjuntos com orçamento diário (ABO).",
      );
    return { ...row };
  });
}

export async function runBulkOperations(items, apply, onProgress = () => {}) {
  const unique = [...new Map(items.map((i) => [i.id, i])).values()];
  if (unique.length < 1 || unique.length > 50) throw new Error("Selecione entre 1 e 50 itens.");
  const results = [];
  for (const item of unique) {
    try {
      await apply(item);
      results.push({ id: item.id, name: item.name, ok: true });
    } catch (e) {
      results.push({
        id: item.id,
        name: item.name,
        ok: false,
        error: String(e?.message || "Não foi possível confirmar a alteração."),
      });
    }
    onProgress([...results]);
  }
  return results;
}
