import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

type Sale = { id: string; client_name: string; service: string; sale_value: number; notes: string | null };
export function SaleToFinance({ sale }: { sale: Sale }) {
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  const [received, setReceived] = useState(false);
  const [sent, setSent] = useState(false);
  const client = useQueryClient();
  const transfer = useMutation({
    mutationFn: async () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("Informe o vencimento.");
      const id = `sale_${sale.id}`;
      const { data: dashboard, error: readError } = await supabase.functions.invoke("n8n-workflows", {
        body: { action: "finance-dashboard", mes: due.slice(0,7) },
      });
      if (readError || dashboard?.error) throw new Error("Não foi possível conferir o Financeiro. Tente novamente.");
      if (dashboard?.recebimentos?.some((entry: { id: string }) => entry.id === id)) {
        throw new Error("Esta venda já possui um lançamento neste mês. Edite pelo Financeiro.");
      }
      const { data, error } = await supabase.functions.invoke("n8n-workflows", {
        body: { action: "finance-create", lancamento: {
          id, tipo: "Receita", descricao: `${sale.service} — ${sale.client_name}`,
          cliente_nome: sale.client_name, servico_nome: sale.service,
          vencimento: due, competencia_ym: due.slice(0,7), valor_previsto: Number(sale.sale_value),
          modalidade: "Unico", recorrente: false,
          status: received ? "Pago" : "Pendente", pagamento: received ? due : "",
          valor_realizado: received ? Number(sale.sale_value) : 0,
          observacoes: [sale.notes, `Venda vinculada: ${sale.id}`].filter(Boolean).join("\n"),
        } },
      });
      if (error || data?.error || data?.ok === false) throw new Error(data?.message || data?.error || error?.message || "Falha ao lançar no Financeiro.");
    },
    onSuccess: () => {
      setSent(true); setOpen(false);
      void client.invalidateQueries({ queryKey: ["finance-dashboard"] });
      toast.success("Venda lançada no Financeiro.");
    },
    onError: (error) => toast.error(error.message),
  });
  return <>
    <Button size="sm" variant="outline" disabled={sent} onClick={() => setOpen(true)}>
      {sent ? "Enviada ao Financeiro" : "Enviar ao Financeiro"}
    </Button>
    <Dialog open={open} onOpenChange={(value) => { if (!transfer.isPending) setOpen(value); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Lançar venda no Financeiro</DialogTitle>
          <DialogDescription>Confira os dados. Será criada uma receita única, sem recorrência.</DialogDescription>
        </DialogHeader>
        <p className="font-medium">{sale.client_name}</p>
        <p>{sale.service} · {Number(sale.sale_value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
        {sale.notes && <p className="whitespace-pre-wrap text-sm">{sale.notes}</p>}
        <label className="space-y-1 text-sm">{received ? "Vencimento / data do recebimento" : "Vencimento"}
          <Input type="date" value={due} disabled={transfer.isPending} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">Situação
          <select className="block w-full rounded border bg-background p-2" value={received ? "paid" : "pending"}
            disabled={transfer.isPending} onChange={(e) => setReceived(e.target.value === "paid")}>
            <option value="pending">Pendente — a receber</option><option value="paid">Recebido integralmente</option>
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={transfer.isPending} onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={transfer.isPending} onClick={() => transfer.mutate()}>{transfer.isPending ? "Lançando…" : "Confirmar lançamento"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
