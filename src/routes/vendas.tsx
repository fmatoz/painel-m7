import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeDollarSign,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  LogOut,
  Menu,
  Plus,
  Trash2,
  WalletCards,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppAccess } from "@/hooks/use-access";
import { useAppSidebar } from "@/hooks/use-app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Sale = Tables<"sdr_sales">;
type TeamSettings = Tables<"team_settings">;
type SaleStatus = "pending" | "approved" | "rejected" | "paid";

const services = ["Site", "Tráfego pago", "Automação", "Outro"];

const statusLabels: Record<SaleStatus, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
  paid: "Comissão paga",
};

const statusStyles: Record<SaleStatus, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  approved: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  rejected: "border-red-500/30 bg-red-500/10 text-red-300",
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));

const parseMoneyInput = (value: string) => {
  const cleaned = value.trim().replace(/[^\d,.-]/g, "");
  return Number(cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned);
};

export const Route = createFileRoute("/vendas")({
  head: () => ({
    title: "Vendas e comissões | Painel M7",
    meta: [{ name: "description", content: "Registro de vendas e comissões da equipe M7." }],
  }),
  component: SalesComponent,
});

function SalesComponent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sidebar = useAppSidebar();
  const { user, session, loading: authLoading, signOut } = useAuth();
  const access = useAppAccess();
  const isAdmin = Boolean(access.profile?.is_admin);
  const [clientName, setClientName] = useState("");
  const [service, setService] = useState("Site");
  const [customService, setCustomService] = useState("");
  const [saleValue, setSaleValue] = useState("");
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!authLoading && !session) navigate({ to: "/login", search: {} as never });
  }, [authLoading, navigate, session]);

  useEffect(() => {
    if (!access.loading && session && !access.can("crm")) {
      window.location.href = access.firstAllowedPath;
    }
  }, [access, session]);

  const settingsQuery = useQuery({
    queryKey: ["team-settings"],
    enabled: Boolean(session && !access.loading && access.can("crm")),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_settings")
        .select("*")
        .eq("id", "global")
        .single();
      if (error) throw error;
      return data as TeamSettings;
    },
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const salesQuery = useQuery({
    queryKey: ["sdr-sales"],
    enabled: Boolean(session && !access.loading && access.can("crm")),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sdr_sales")
        .select("*")
        .order("sale_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Sale[];
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const createSale = useMutation({
    mutationFn: async () => {
      const parsedValue = parseMoneyInput(saleValue);
      const selectedService = service === "Outro" ? customService.trim() : service;
      if (!clientName.trim() || !selectedService || !Number.isFinite(parsedValue) || parsedValue <= 0) {
        throw new Error("Preencha cliente, serviço e valor corretamente.");
      }
      const { data, error } = await supabase
        .from("sdr_sales")
        .insert({
          client_name: clientName.trim(),
          service: selectedService,
          sale_value: parsedValue,
          sale_date: saleDate,
          notes: notes.trim(),
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Sale;
    },
    onSuccess: (sale) => {
      queryClient.invalidateQueries({ queryKey: ["sdr-sales"] });
      setClientName("");
      setService("Site");
      setCustomService("");
      setSaleValue("");
      setNotes("");
      toast.success(
        `Venda registrada com ${Number(sale.commission_rate).toLocaleString("pt-BR")}% de comissão.`,
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a venda."),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SaleStatus }) => {
      const { error } = await supabase.from("sdr_sales").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sdr-sales"] });
      toast.success("Situação da venda atualizada.");
    },
    onError: () => toast.error("Não foi possível atualizar a venda."),
  });

  const deleteSale = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sdr_sales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sdr-sales"] });
      toast.success("Venda excluída.");
    },
    onError: () => toast.error("Não foi possível excluir a venda."),
  });

  const summary = useMemo(() => {
    const sales = salesQuery.data ?? [];
    const confirmed = sales.filter((sale) => sale.status === "approved" || sale.status === "paid");
    return {
      sold: confirmed.reduce((sum, sale) => sum + Number(sale.sale_value), 0),
      commission: confirmed.reduce((sum, sale) => sum + Number(sale.commission_value), 0),
      receivable: sales
        .filter((sale) => sale.status === "approved")
        .reduce((sum, sale) => sum + Number(sale.commission_value), 0),
      paid: sales
        .filter((sale) => sale.status === "paid")
        .reduce((sum, sale) => sum + Number(sale.commission_value), 0),
      pending: sales.filter((sale) => sale.status === "pending").length,
    };
  }, [salesQuery.data]);

  if (authLoading || access.loading || !session || !user || !access.can("crm")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-white">
      <AppSidebar active="vendas" {...sidebar} />
      <main
        className={`flex h-full min-w-0 flex-1 flex-col transition-[padding] duration-200 ${sidebar.collapsed ? "lg:pl-20" : "lg:pl-64"}`}
      >
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-950/90 px-4 backdrop-blur md:px-6">
          <button onClick={() => sidebar.setMobileOpen(true)} className="lg:hidden">
            <Menu className="h-6 w-6 text-zinc-400" />
          </button>
          <BadgeDollarSign className="h-5 w-5 text-emerald-400" />
          <div>
            <h1 className="font-bold">Vendas e comissões</h1>
            <p className="hidden text-xs text-zinc-500 sm:block">
              Registre vendas e acompanhe seus ganhos
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-zinc-500 md:block">{user.email}</span>
            <button
              onClick={() => signOut()}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              aria-label="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 lg:p-7">
          <div className="mx-auto max-w-7xl space-y-6">
            <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <h2 className="text-2xl font-bold">{isAdmin ? "Vendas da equipe" : "Minhas vendas"}</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  A porcentagem é gravada no momento do cadastro e não muda depois.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-emerald-300/70">Comissão vigente</p>
                <p className="text-2xl font-bold text-emerald-300">
                  {settingsQuery.isLoading
                    ? "—"
                    : `${Number(settingsQuery.data?.commission_rate ?? 15).toLocaleString("pt-BR")}%`}
                </p>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard label="Total vendido" value={money(summary.sold)} icon={<WalletCards />} />
              <SummaryCard
                label="Comissão confirmada"
                value={money(summary.commission)}
                icon={<BadgeDollarSign />}
              />
              <SummaryCard label="A receber" value={money(summary.receivable)} icon={<Clock3 />} />
              <SummaryCard label="Comissão paga" value={money(summary.paid)} icon={<CheckCircle2 />} />
              <SummaryCard label="Aguardando aprovação" value={String(summary.pending)} icon={<CalendarDays />} />
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
              <div className="mb-5">
                <h2 className="text-lg font-semibold">Registrar venda</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  O sistema aplicará automaticamente a comissão vigente.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <label className="text-xs text-zinc-400 xl:col-span-2">
                  Cliente
                  <Input
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                    maxLength={200}
                    placeholder="Nome do cliente ou empresa"
                    className="mt-1 border-zinc-700 bg-zinc-950"
                  />
                </label>
                <label className="text-xs text-zinc-400">
                  Serviço
                  <select
                    value={service}
                    onChange={(event) => setService(event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm"
                  >
                    {services.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-zinc-400">
                  Valor da venda
                  <Input
                    value={saleValue}
                    onChange={(event) => setSaleValue(event.target.value)}
                    inputMode="decimal"
                    placeholder="Ex.: 600,00"
                    className="mt-1 border-zinc-700 bg-zinc-950"
                  />
                </label>
                <label className="text-xs text-zinc-400">
                  Data
                  <Input
                    type="date"
                    value={saleDate}
                    onChange={(event) => setSaleDate(event.target.value)}
                    className="mt-1 border-zinc-700 bg-zinc-950"
                  />
                </label>
              </div>
              {service === "Outro" && (
                <label className="mt-4 block text-xs text-zinc-400">
                  Qual serviço?
                  <Input
                    value={customService}
                    onChange={(event) => setCustomService(event.target.value)}
                    maxLength={120}
                    className="mt-1 border-zinc-700 bg-zinc-950"
                  />
                </label>
              )}
              <label className="mt-4 block text-xs text-zinc-400">
                Observações (opcional)
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={2000}
                  rows={2}
                  className="mt-1 border-zinc-700 bg-zinc-950"
                />
              </label>
              <div className="mt-5 flex justify-end">
                <Button
                  onClick={() => createSale.mutate()}
                  disabled={createSale.isPending || settingsQuery.isLoading}
                  className="bg-emerald-600 hover:bg-emerald-500"
                >
                  {createSale.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Registrar venda
                </Button>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
              <div className="mb-5">
                <h2 className="text-lg font-semibold">Histórico</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {isAdmin ? "Aprove e acompanhe as vendas de toda a equipe." : "Acompanhe a validação das suas vendas."}
                </p>
              </div>
              {salesQuery.isLoading ? (
                <div className="flex min-h-40 items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
                </div>
              ) : salesQuery.error ? (
                <div className="rounded-xl border border-red-900 bg-red-950/30 p-6 text-center text-red-300">
                  Não foi possível carregar as vendas.
                </div>
              ) : (salesQuery.data ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center text-zinc-500">
                  Nenhuma venda registrada ainda.
                </div>
              ) : (
                <div className="space-y-3">
                  {(salesQuery.data ?? []).map((sale) => {
                    const status = sale.status as SaleStatus;
                    const canDelete = isAdmin || (sale.seller_id === user.id && status === "pending");
                    return (
                      <article
                        key={sale.id}
                        className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-zinc-100">{sale.client_name}</h3>
                              <span className={`rounded-md border px-2 py-0.5 text-[11px] ${statusStyles[status]}`}>
                                {statusLabels[status]}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
                              {isAdmin && <span>Vendedor: {sale.seller_name}</span>}
                              <span>{sale.service}</span>
                              <span>{formatDate(sale.sale_date)}</span>
                              <span>Taxa registrada: {Number(sale.commission_rate).toLocaleString("pt-BR")}%</span>
                            </div>
                            {sale.notes && <p className="mt-2 text-sm text-zinc-400">{sale.notes}</p>}
                          </div>
                          <div className="grid shrink-0 grid-cols-2 gap-4 text-right">
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Venda</p>
                              <p className="font-semibold text-zinc-200">{money(Number(sale.sale_value))}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Comissão</p>
                              <p className="font-semibold text-emerald-400">
                                {money(Number(sale.commission_value))}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap justify-end gap-2">
                            {isAdmin && status !== "approved" && status !== "paid" && (
                              <Button
                                size="sm"
                                onClick={() => updateStatus.mutate({ id: sale.id, status: "approved" })}
                                disabled={updateStatus.isPending}
                                className="bg-blue-600 hover:bg-blue-500"
                              >
                                <Check className="mr-1 h-4 w-4" /> Aprovar
                              </Button>
                            )}
                            {isAdmin && status === "approved" && (
                              <Button
                                size="sm"
                                onClick={() => updateStatus.mutate({ id: sale.id, status: "paid" })}
                                disabled={updateStatus.isPending}
                                className="bg-emerald-600 hover:bg-emerald-500"
                              >
                                <CheckCircle2 className="mr-1 h-4 w-4" /> Marcar paga
                              </Button>
                            )}
                            {isAdmin && status !== "rejected" && status !== "paid" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateStatus.mutate({ id: sale.id, status: "rejected" })}
                                disabled={updateStatus.isPending}
                                className="border-red-800 text-red-300"
                              >
                                <XCircle className="mr-1 h-4 w-4" /> Rejeitar
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Excluir venda"
                                onClick={() => {
                                  if (window.confirm(`Excluir a venda para ${sale.client_name}?`)) {
                                    deleteSale.mutate(sale.id);
                                  }
                                }}
                                disabled={deleteSale.isPending}
                                className="text-zinc-500 hover:text-red-400"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-2 text-zinc-500">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <p className="text-[10px] font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-2 text-xl font-bold text-zinc-100">{value}</p>
    </div>
  );
}
