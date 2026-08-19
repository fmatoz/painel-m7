import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  LogOut,
  Loader2,
  RefreshCw,
  Plus,
  TrendingUp,
  TrendingDown,
  Wallet,
  Calendar,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import logoAsset from "@/assets/logo-v2.png.asset.json";
import { toast } from "sonner";

type FinanceData = {
  competencia: string;
  kpis: {
    recebido: number;
    a_receber: number;
    despesas_pagas: number;
    caixa_mes: number;
    receita_recorrente: number;
    receita_unica: number;
  };
  servicos: Array<{
    servico: string;
    valor: number;
  }>;
    recebimentos: Array<{
    id: string;
    tipo: string;
    descricao: string;
    cliente_id: string;
    cliente: string;
    cliente_nome: string;
    servico_id: string;
    servico: string;
    servico_nome: string;
    modalidade: string;
    vencimento: string;
    status: string;
    valor_previsto: number;
    valor_realizado: number;
  }>;
};

export const Route = createFileRoute("/financeiro")({
  component: FinanceiroComponent,
});

function FinanceiroComponent() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [isNewLancamentoOpen, setIsNewLancamentoOpen] = useState(false);
  const [isEditLancamentoOpen, setIsEditLancamentoOpen] = useState(false);
  const [isConfirmReceiveOpen, setIsConfirmReceiveOpen] = useState(false);
  const [selectedRecebimento, setSelectedRecebimento] = useState<FinanceData["recebimentos"][0] | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [serviceFilter, setServiceFilter] = useState("Todos");
  const [newLancamento, setNewLancamento] = useState({
    tipo: "Receita",
    descricao: "",
    vencimento: new Date().toISOString().split("T")[0],
    valor_previsto: 0,
    cliente_nome: "",
    servico_nome: "",
    modalidade: "Mensal",
    recorrente: true,
    data_inicio_recorrencia: "",
    data_fim_recorrencia: "",
  });

  const [editLancamento, setEditLancamento] = useState<any>(null);
  
  const navigate = useNavigate();
  const { user, session, loading: authLoading, signOut } = useAuth();
  const queryClient = useQueryClient();

  const { data: financeData, isLoading, error, refetch } = useQuery({
    queryKey: ["finance-dashboard", selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("n8n-workflows", {
        body: { action: "finance-dashboard", mes: selectedMonth },
      });
      if (error) throw error;
      return data as FinanceData;
    },
    enabled: !!session,
  });

  const uniqueServices = useMemo(() => {
    if (!financeData?.recebimentos) return [];
    const services = new Set(financeData.recebimentos.map(r => r.servico));
    return Array.from(services).sort();
  }, [financeData]);

  const filteredRecebimentos = useMemo(() => {
    if (!financeData?.recebimentos) return [];
    return financeData.recebimentos.filter((l) => {
      const matchesSearch = l.cliente.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            l.servico.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "Todos" || l.status === statusFilter;
      const matchesService = serviceFilter === "Todos" || l.servico === serviceFilter;
      return matchesSearch && matchesStatus && matchesService;
    });
  }, [financeData, searchTerm, statusFilter, serviceFilter]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val || 0);
  };

  const formatDateBR = (dateStr: string) => {
    if (!dateStr) return "-";
    // Detectar formato YYYY-MM-DD
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [_, year, month, day] = isoMatch;
      return `${day}/${month}/${year}`;
    }
    
    // Fallback para outros formatos
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  const formatDate = formatDateBR;

  const maxServiceValue = useMemo(() => {
    if (!financeData?.servicos) return 0;
    return Math.max(...financeData.servicos.map(s => s.valor), 0);
  }, [financeData]);

  const createMutation = useMutation({
    mutationFn: async (lancamento: any) => {
      const { data, error } = await supabase.functions.invoke("n8n-workflows", {
        body: { 
          action: "finance-create", 
          lancamento: { 
            ...lancamento, 
            competencia_ym: selectedMonth 
          } 
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Lançamento criado com sucesso!");
      setIsNewLancamentoOpen(false);
      queryClient.invalidateQueries({ queryKey: ["finance-dashboard"] });
    },
    onError: (err: any) => {
      toast.error(`Erro ao criar lançamento: ${err.message || "Tente novamente"}`);
    }
  });

  const receiveMutation = useMutation({
    mutationFn: async ({ id, valor }: { id: string; valor: number }) => {
      const { data, error } = await supabase.functions.invoke("n8n-workflows", {
        body: { 
          action: "finance-receive", 
          receiveData: { id, pagamento: new Date().toISOString().split('T')[0], valor_realizado: valor } 
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Baixa realizada!");
      setIsConfirmReceiveOpen(false);
      setSelectedRecebimento(null);
      queryClient.invalidateQueries({ queryKey: ["finance-dashboard"] });
    },
    onError: (err: any) => {
      toast.error(`Erro ao realizar baixa: ${err.message || "Tente novamente"}`);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (lancamento: any) => {
      const { data, error } = await supabase.functions.invoke("n8n-workflows", {
        body: { 
          action: "finance-update", 
          lancamento
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Lançamento atualizado!");
      setIsEditLancamentoOpen(false);
      queryClient.invalidateQueries({ queryKey: ["finance-dashboard"] });
    },
    onError: (err: any) => {
      toast.error(`Erro ao atualizar lançamento: ${err.message || "Tente novamente"}`);
    }
  });

  const handleEditClick = (recebimento: FinanceData["recebimentos"][0]) => {
    setEditLancamento({
      id: recebimento.id,
      tipo: recebimento.tipo || "Receita",
      descricao: recebimento.descricao || "",
      vencimento: recebimento.vencimento ? recebimento.vencimento.slice(0, 10) : "",
      valor_previsto: recebimento.valor_previsto,
      cliente_id: recebimento.cliente_id,
      cliente_nome: recebimento.cliente_nome || recebimento.cliente,
      servico_id: recebimento.servico_id,
      servico_nome: recebimento.servico_nome || recebimento.servico,
      modalidade: recebimento.modalidade || "Mensal",
      recorrente: recebimento.modalidade === "Mensal",
      data_inicio_recorrencia: recebimento.vencimento ? recebimento.vencimento.slice(0, 10) : "",
      data_fim_recorrencia: "",
    });
    setIsEditLancamentoOpen(true);
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-white font-sans overflow-hidden">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-zinc-900 border-r border-zinc-800 transition-transform lg:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center px-6 border-b border-zinc-800">
          <img src={logoAsset.url} alt="Logo" className="h-8" />
        </div>
        <nav className="p-4 space-y-2">
          <a href="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:bg-zinc-800">
            <LayoutDashboard className="w-5 h-5" />
            Workflows
          </a>
          <a href="/financeiro" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-600 text-white font-medium">
            <TrendingUp className="w-5 h-5" />
            Financeiro
          </a>
        </nav>
      </aside>

      <main className="flex-1 lg:pl-64 flex flex-col h-full overflow-hidden">
        <header className="h-20 flex items-center justify-between px-6 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur shrink-0">
          <div>
            <h1 className="text-xl font-bold">Financeiro</h1>
            <p className="text-sm text-zinc-400">Visão clara do mês da Gestão M7</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-zinc-500 hidden md:inline">{user?.email}</span>
            <Button variant="ghost" size="icon" onClick={() => signOut()}>
              <LogOut className="w-5 h-5 text-zinc-400 hover:text-white" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6">
          <div className="flex gap-4 items-center flex-wrap">
            <Input 
              type="month" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)} 
              className="w-40 bg-zinc-900 border-zinc-800" 
            />
            <Button onClick={() => setIsNewLancamentoOpen(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" /> Novo Lançamento
            </Button>
            <button
                onClick={() => refetch()}
                className="p-2 text-zinc-400 hover:text-white transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-lg flex items-center gap-3 text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div className="flex-1 text-sm">Falha ao carregar dados.</div>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="border-red-900 hover:bg-red-900/20 text-red-400">
                Tentar novamente
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Recebido</p>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-green-500">{formatCurrency(financeData?.kpis.recebido || 0)}</p>
            </div>
            <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-blue-500" />
                <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">A Receber</p>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-blue-500">{formatCurrency(financeData?.kpis.a_receber || 0)}</p>
            </div>
            <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Despesas</p>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-red-500">{formatCurrency(financeData?.kpis.despesas_pagas || 0)}</p>
            </div>
            <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-zinc-400" />
                <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Caixa</p>
              </div>
              <p className="text-xl lg:text-2xl font-bold">{formatCurrency(financeData?.kpis.caixa_mes || 0)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="p-6 bg-zinc-900 rounded-xl border border-zinc-800">
                <h3 className="font-semibold mb-6 flex items-center gap-2">
                   Entradas x Despesas x Resultado
                </h3>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Recebido</span>
                      <span>{formatCurrency(financeData?.kpis.recebido || 0)}</span>
                    </div>
                    <Progress value={((financeData?.kpis.recebido || 0) / (financeData?.kpis.recebido || 1)) * 100} className="h-2 bg-zinc-800" indicatorClassName="bg-green-500" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Despesas</span>
                      <span>{formatCurrency(financeData?.kpis.despesas_pagas || 0)}</span>
                    </div>
                    <Progress value={((financeData?.kpis.despesas_pagas || 0) / (financeData?.kpis.recebido || 1)) * 100} className="h-2 bg-zinc-800" indicatorClassName="bg-red-500" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Resultado</span>
                      <span>{formatCurrency(financeData?.kpis.caixa_mes || 0)}</span>
                    </div>
                    <Progress value={((financeData?.kpis.caixa_mes || 0) / (financeData?.kpis.recebido || 1)) * 100} className="h-2 bg-zinc-800" indicatorClassName="bg-blue-500" />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-zinc-900 rounded-xl border border-zinc-800">
                <h3 className="font-semibold mb-4 text-sm text-zinc-400 uppercase tracking-wider">Receitas por serviço</h3>
                <div className="space-y-5">
                   {financeData?.servicos.map((s, idx) => (
                     <div key={idx} className="space-y-2">
                       <div className="flex justify-between text-sm">
                         <span>{s.servico}</span>
                         <span className="font-medium">{formatCurrency(s.valor)}</span>
                       </div>
                       <Progress value={maxServiceValue > 0 ? (s.valor / maxServiceValue) * 100 : 0} className="h-1.5 bg-zinc-800" indicatorClassName="bg-blue-600" />
                     </div>
                   ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="p-6 bg-zinc-900 rounded-xl border border-zinc-800">
                <h3 className="font-semibold mb-4 text-sm text-zinc-400 uppercase tracking-wider">Recorrência</h3>
                <div className="space-y-4">
                  <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase">Mensal (MRR)</p>
                      <p className="text-lg font-bold">{formatCurrency(financeData?.kpis.receita_recorrente || 0)}</p>
                    </div>
                    <RefreshCw className="w-5 h-5 text-zinc-700" />
                  </div>
                  <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase">Única</p>
                      <p className="text-lg font-bold">{formatCurrency(financeData?.kpis.receita_unica || 0)}</p>
                    </div>
                    <TrendingUp className="w-5 h-5 text-zinc-700" />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-zinc-900 rounded-xl border border-zinc-800">
                <h3 className="font-semibold mb-4 text-sm text-zinc-400 uppercase tracking-wider">Precisa da sua atenção</h3>
                <div className="space-y-3">
                  {financeData?.recebimentos.filter(r => r.status === "Pendente").slice(0, 4).map(r => (
                    <div key={r.id} className="flex justify-between items-center p-2 rounded-lg hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.cliente}</p>
                        <p className="text-[10px] text-zinc-500">{formatDateBR(r.vencimento)}</p>
                      </div>
                      <span className="text-sm font-bold text-blue-500 whitespace-nowrap ml-2">
                        {formatCurrency(r.valor_previsto)}
                      </span>
                    </div>
                  ))}
                  {(!financeData?.recebimentos.some(r => r.status === "Pendente")) && (
                    <p className="text-xs text-zinc-500 italic text-center py-2">Tudo em dia por aqui!</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden mb-8">
             <div className="p-4 flex gap-4 border-b border-zinc-800 flex-col md:flex-row">
               <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500"/>
                 <Input 
                   placeholder="Buscar cliente ou serviço..." 
                   className="pl-9 bg-zinc-800 border-zinc-700 focus:ring-blue-600" 
                   value={searchTerm} 
                   onChange={e => setSearchTerm(e.target.value)}
                 />
               </div>
               <div className="flex gap-2">
                 <Select value={serviceFilter} onValueChange={setServiceFilter}>
                   <SelectTrigger className="w-full md:w-40 bg-zinc-800 border-zinc-700">
                     <SelectValue placeholder="Serviço" />
                   </SelectTrigger>
                   <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                     <SelectItem value="Todos">Todos Serviços</SelectItem>
                     {uniqueServices.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                   </SelectContent>
                 </Select>
                 <Select value={statusFilter} onValueChange={setStatusFilter}>
                   <SelectTrigger className="w-full md:w-40 bg-zinc-800 border-zinc-700">
                     <SelectValue placeholder="Status" />
                   </SelectTrigger>
                   <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                     <SelectItem value="Todos">Todos Status</SelectItem>
                     <SelectItem value="Pago">Pago</SelectItem>
                     <SelectItem value="Pendente">Pendente</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
             </div>
             
             <div className="overflow-x-auto">
               <table className="w-full text-sm">
                 <thead className="bg-zinc-800/50 text-zinc-500 uppercase text-[10px] font-bold tracking-widest">
                   <tr>
                     <th className="p-4 text-left">Cliente</th>
                     <th className="p-4 text-left">Serviço</th>
                     <th className="p-4 text-center">Vencimento</th>
                     <th className="p-4 text-right">Valor</th>
                     <th className="p-4 text-center">Status</th>
                     <th className="p-4 text-right">Ação</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-zinc-800/50">
                   {filteredRecebimentos.map(r => (
                     <tr key={r.id} className="hover:bg-zinc-800/30 transition-colors">
                       <td className="p-4 font-medium">{r.cliente}</td>
                       <td className="p-4 text-zinc-400">{r.servico}</td>
                       <td className="p-4 text-center text-zinc-400">{formatDate(r.vencimento)}</td>
                       <td className="p-4 text-right font-mono font-bold">{formatCurrency(r.valor_previsto)}</td>
                        <td className="p-4 text-center">
                           <Badge 
                             variant={r.status === 'Pago' || r.valor_realizado >= r.valor_previsto ? 'default' : 'secondary'} 
                             className={r.status === 'Pago' || r.valor_realizado >= r.valor_previsto ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'}
                           >
                             {r.status === 'Pago' || r.valor_realizado >= r.valor_previsto ? 'Pago' : r.status}
                           </Badge>
                        </td>
                         <td className="p-4 text-right">
                           <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-zinc-800 border-zinc-700 h-8 px-3 text-xs hover:bg-zinc-700"
                              onClick={() => handleEditClick(r)}
                            >
                              Editar
                            </Button>
                            {(r.status === 'Pendente' && r.valor_realizado < r.valor_previsto) && (
                              <Button 
                                size="sm" 
                                className="bg-blue-600 hover:bg-blue-700 h-8 px-3 text-xs" 
                                onClick={() => {
                                  setSelectedRecebimento(r);
                                  setIsConfirmReceiveOpen(true);
                                }}
                                disabled={receiveMutation.isPending}
                              >
                                Baixar
                              </Button>
                            )}
                           </div>
                         </td>
                     </tr>
                   ))}
                   {filteredRecebimentos.length === 0 && (
                     <tr>
                       <td colSpan={6} className="p-8 text-center text-zinc-500">Nenhum lançamento encontrado.</td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      </main>

      {/* Modal Novo Lançamento */}
      <Dialog open={isNewLancamentoOpen} onOpenChange={setIsNewLancamentoOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Lançamento</DialogTitle>
            <DialogDescription className="text-zinc-500">Preencha os dados do novo lançamento financeiro.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={newLancamento.tipo} onValueChange={(v) => setNewLancamento({...newLancamento, tipo: v})}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectItem value="Receita">Receita</SelectItem>
                    <SelectItem value="Despesa">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Modalidade</Label>
                <Select value={newLancamento.modalidade} onValueChange={(v) => setNewLancamento({...newLancamento, modalidade: v})}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectItem value="Mensal">Mensal — repetir automaticamente nos próximos meses</SelectItem>
                    <SelectItem value="Unico">Único — somente este lançamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {newLancamento.modalidade === "Mensal" && (
              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg space-y-4">
                <div className="flex items-center gap-2 text-blue-500">
                  <RefreshCw className="w-4 h-4" />
                  <span className="text-sm font-semibold">Recorrência</span>
                </div>
                <p className="text-xs text-zinc-400">Este lançamento será repetido nos meses seguintes</p>
                <div className="space-y-2">
                  <Label>Repetir até (opcional)</Label>
                  <Input 
                    type="date"
                    value={newLancamento.data_fim_recorrencia}
                    onChange={e => setNewLancamento({...newLancamento, data_fim_recorrencia: e.target.value})}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input 
                value={newLancamento.descricao} 
                onChange={e => setNewLancamento({...newLancamento, descricao: e.target.value})}
                placeholder="Ex: Projeto Landing Page" 
                className="bg-zinc-800 border-zinc-700" 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cliente / Fornecedor</Label>
                <Input 
                  value={newLancamento.cliente_nome} 
                  onChange={e => setNewLancamento({...newLancamento, cliente_nome: e.target.value})}
                  placeholder="Nome" 
                  className="bg-zinc-800 border-zinc-700" 
                />
              </div>
              <div className="space-y-2">
                <Label>Serviço / Categoria</Label>
                <Input 
                  value={newLancamento.servico_nome} 
                  onChange={e => setNewLancamento({...newLancamento, servico_nome: e.target.value})}
                  placeholder="Tipo de serviço" 
                  className="bg-zinc-800 border-zinc-700" 
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input 
                  type="date" 
                  value={newLancamento.vencimento} 
                  onChange={e => setNewLancamento({...newLancamento, vencimento: e.target.value})}
                  className="bg-zinc-800 border-zinc-700" 
                />
              </div>
              <div className="space-y-2">
                <Label>Valor Previsto (R$)</Label>
                <Input 
                  type="number" 
                  value={newLancamento.valor_previsto || ""} 
                  onChange={e => setNewLancamento({...newLancamento, valor_previsto: Number(e.target.value)})}
                  placeholder="0,00" 
                  className="bg-zinc-800 border-zinc-700" 
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={() => setIsNewLancamentoOpen(false)}>Cancelar</Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700" 
              onClick={() => {
                const payload = {
                  ...newLancamento,
                  recorrente: newLancamento.modalidade === "Mensal",
                  data_inicio_recorrencia: newLancamento.modalidade === "Mensal" ? newLancamento.vencimento : null,
                  data_fim_recorrencia: (newLancamento.modalidade === "Mensal" && newLancamento.data_fim_recorrencia) ? newLancamento.data_fim_recorrencia : null,
                };
                createMutation.mutate(payload);
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Criar Lançamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Lançamento */}
      <Dialog open={isEditLancamentoOpen} onOpenChange={setIsEditLancamentoOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Editar lançamento</DialogTitle>
            <DialogDescription className="text-zinc-500">Altere os dados do lançamento financeiro.</DialogDescription>
          </DialogHeader>
          {editLancamento && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={editLancamento.tipo} onValueChange={(v) => setEditLancamento({...editLancamento, tipo: v})}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectItem value="Receita">Receita</SelectItem>
                      <SelectItem value="Despesa">Despesa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Modalidade</Label>
                  <Select value={editLancamento.modalidade} onValueChange={(v) => setEditLancamento({...editLancamento, modalidade: v})}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectItem value="Mensal">Mensal — repetir automaticamente nos próximos meses</SelectItem>
                      <SelectItem value="Unico">Único — somente este lançamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input 
                  value={editLancamento.descricao} 
                  onChange={e => setEditLancamento({...editLancamento, descricao: e.target.value})}
                  className="bg-zinc-800 border-zinc-700" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cliente / Fornecedor</Label>
                  <Input 
                    value={editLancamento.cliente_nome} 
                    onChange={e => setEditLancamento({...editLancamento, cliente_nome: e.target.value})}
                    className="bg-zinc-800 border-zinc-700" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Serviço / Categoria</Label>
                  <Input 
                    value={editLancamento.servico_nome} 
                    onChange={e => setEditLancamento({...editLancamento, servico_nome: e.target.value})}
                    className="bg-zinc-800 border-zinc-700" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vencimento</Label>
                  <Input 
                    type="date" 
                    value={editLancamento.vencimento} 
                    onChange={e => setEditLancamento({...editLancamento, vencimento: e.target.value})}
                    className="bg-zinc-800 border-zinc-700" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor Previsto (R$)</Label>
                  <Input 
                    type="number" 
                    value={editLancamento.valor_previsto || ""} 
                    onChange={e => setEditLancamento({...editLancamento, valor_previsto: Number(e.target.value)})}
                    className="bg-zinc-800 border-zinc-700" 
                  />
                </div>
              </div>

              {editLancamento.modalidade === "Mensal" && (
                <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg space-y-4">
                  <div className="flex items-center gap-2 text-blue-500">
                    <RefreshCw className="w-4 h-4" />
                    <span className="text-sm font-semibold">Recorrência</span>
                  </div>
                  <p className="text-xs text-zinc-400">Este lançamento será repetido nos meses seguintes</p>
                  <div className="space-y-2">
                    <Label>Repetir até (opcional)</Label>
                    <Input 
                      type="date"
                      value={editLancamento.data_fim_recorrencia}
                      onChange={e => setEditLancamento({...editLancamento, data_fim_recorrencia: e.target.value})}
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-4">
                <Button variant="ghost" onClick={() => setIsEditLancamentoOpen(false)}>Cancelar</Button>
                <Button 
                  className="bg-blue-600 hover:bg-blue-700" 
                  onClick={() => {
                    const payload = {
                      ...editLancamento,
                      recorrente: editLancamento.modalidade === "Mensal",
                      data_inicio_recorrencia: editLancamento.modalidade === "Mensal" ? editLancamento.vencimento : null,
                      data_fim_recorrencia: (editLancamento.modalidade === "Mensal" && editLancamento.data_fim_recorrencia) ? editLancamento.data_fim_recorrencia : null,
                    };
                    updateMutation.mutate(payload);
                  }}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <TrendingUp className="w-4 h-4 mr-2" />}
                  Salvar alterações
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Confirmação de Baixa */}
      <Dialog open={isConfirmReceiveOpen} onOpenChange={setIsConfirmReceiveOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Recebimento</DialogTitle>
            <DialogDescription className="text-zinc-500">Deseja confirmar a baixa deste lançamento?</DialogDescription>
          </DialogHeader>
          {selectedRecebimento && (
            <div className="py-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Cliente:</span>
                <span className="font-medium">{selectedRecebimento.cliente}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Serviço:</span>
                <span className="font-medium">{selectedRecebimento.servico}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Valor a Receber:</span>
                <span className="font-bold text-green-500">{formatCurrency(selectedRecebimento.valor_previsto - selectedRecebimento.valor_realizado)}</span>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={() => {
              setIsConfirmReceiveOpen(false);
              setSelectedRecebimento(null);
            }}>
              Cancelar
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700" 
              onClick={() => {
                if (selectedRecebimento) {
                  receiveMutation.mutate({
                    id: selectedRecebimento.id, 
                    valor: selectedRecebimento.valor_previsto - selectedRecebimento.valor_realizado
                  });
                }
              }}
              disabled={receiveMutation.isPending}
            >
              {receiveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Confirmar recebimento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
