import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clipboard, FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/integrations/supabase/types";

type Material = Tables<"crm_materials">;
type AuthorFilter = "all" | "mine" | string;

type Props = {
  accessToken: string;
  currentUserId: string;
  isAdmin: boolean;
};

const CRM_API_URL = "https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-crm/api";

async function materialsApi<T>(token: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(CRM_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    cache: "no-store",
    body: JSON.stringify({ token, ...payload }),
  });
  if (!response.ok) throw new Error(`CRM indisponível (${response.status})`);
  const result = (await response.json()) as { ok?: boolean; data?: T; error?: string };
  if (!result.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
  return result.data as T;
}

export function CrmMaterialLibrary({ accessToken, currentUserId, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [authorFilter, setAuthorFilter] = useState<AuthorFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Material | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const materialsQuery = useQuery({
    queryKey: ["crm-materials"],
    queryFn: () => materialsApi<Material[]>(accessToken, { action: "material-list" }),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const saveMaterial = useMutation({
    mutationFn: async () => {
      const cleanTitle = title.trim();
      const cleanMessage = message.trim();
      if (!cleanTitle || !cleanMessage) throw new Error("Preencha o título e a mensagem.");

      if (selected) {
        return materialsApi<Material>(accessToken, {
          action: "material-update",
          materialId: selected.id,
          title: cleanTitle,
          message: cleanMessage,
        });
      }

      return materialsApi<Material>(accessToken, {
        action: "material-create",
        title: cleanTitle,
        message: cleanMessage,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-materials"] });
      setDialogOpen(false);
      toast.success(selected ? "Material atualizado." : "Material criado.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o material."),
  });

  const deleteMaterial = useMutation({
    mutationFn: async (id: string) => {
      await materialsApi<{ id: string }>(accessToken, {
        action: "material-delete",
        materialId: id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-materials"] });
      setDialogOpen(false);
      toast.success("Material excluído.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Você não tem permissão para excluir este material.",
      ),
  });

  const authors = useMemo(() => {
    const unique = new Map<string, string>();
    for (const item of materialsQuery.data ?? []) unique.set(item.created_by, item.author_name);
    return [...unique.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [materialsQuery.data]);

  const filtered = useMemo(
    () =>
      (materialsQuery.data ?? []).filter(
        (item) =>
          authorFilter === "all" ||
          (authorFilter === "mine" && item.created_by === currentUserId) ||
          item.created_by === authorFilter,
      ),
    [materialsQuery.data, authorFilter, currentUserId],
  );

  const openNew = () => {
    setSelected(null);
    setTitle("");
    setMessage("");
    setDialogOpen(true);
  };

  const openMaterial = (item: Material) => {
    setSelected(item);
    setTitle(item.title);
    setMessage(item.message);
    setDialogOpen(true);
  };

  const canManageSelected = !selected || isAdmin || selected.created_by === currentUserId;

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message);
    toast.success("Mensagem copiada.");
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Materiais de prospecção</h2>
          <p className="text-sm text-zinc-400">
            Respostas e textos prontos para consultar durante o atendimento.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={authorFilter}
            onChange={(event) => setAuthorFilter(event.target.value)}
            aria-label="Filtrar materiais por autor"
            className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-300"
          >
            <option value="all">Todos os autores</option>
            <option value="mine">Criados por mim</option>
            {authors.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-500">
            <Plus className="mr-2 h-4 w-4" />
            Novo material
          </Button>
        </div>
      </div>

      {materialsQuery.isLoading ? (
        <div className="flex h-72 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : materialsQuery.error ? (
        <div className="rounded-xl border border-red-900 bg-red-950/30 p-8 text-center text-red-300">
          Não foi possível carregar os materiais.
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 text-center">
          <FileText className="mb-3 h-9 w-9 text-zinc-600" />
          <p className="font-medium text-zinc-300">Nenhum material neste filtro</p>
          <p className="mt-1 text-sm text-zinc-500">Crie o primeiro texto para a equipe.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openMaterial(item)}
              className="group relative aspect-square min-h-36 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-500/70 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <span className="flex h-full items-center justify-center px-2 pb-5 text-center font-semibold leading-snug text-zinc-100">
                {item.title}
              </span>
              <span className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] truncate text-[11px] text-zinc-500 group-hover:text-zinc-400">
                {item.author_name}
              </span>
            </button>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-zinc-800 bg-zinc-900 text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected && canManageSelected ? (
                <Pencil className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {selected ? selected.title : "Novo material"}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {selected
                ? `Criado por ${selected.author_name}`
                : "Adicione um título e o texto completo."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {canManageSelected ? (
              <>
                <label className="block space-y-2 text-sm">
                  <span className="font-medium text-zinc-300">Título</span>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={160}
                    placeholder="Ex.: Qual o valor?"
                    className="border-zinc-700 bg-zinc-950"
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  <span className="font-medium text-zinc-300">Mensagem</span>
                  <Textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    maxLength={20_000}
                    rows={13}
                    placeholder="Digite a resposta completa..."
                    className="resize-y border-zinc-700 bg-zinc-950 leading-relaxed"
                  />
                </label>
              </>
            ) : (
              <div className="whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-sm leading-relaxed text-zinc-200">
                {message}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {selected && canManageSelected && (
              <Button
                variant="outline"
                className="mr-auto border-red-900 bg-red-950/30 text-red-300 hover:bg-red-950 hover:text-red-200"
                disabled={deleteMaterial.isPending}
                onClick={() => {
                  if (window.confirm(`Excluir o material “${selected.title}”?`)) {
                    deleteMaterial.mutate(selected.id);
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            )}
            {selected && (
              <Button
                variant="outline"
                onClick={copyMessage}
                className="border-zinc-700 bg-zinc-950 text-zinc-200"
              >
                <Clipboard className="mr-2 h-4 w-4" />
                Copiar mensagem
              </Button>
            )}
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-zinc-300">
              Fechar
            </Button>
            {canManageSelected && (
              <Button
                onClick={() => saveMaterial.mutate()}
                disabled={saveMaterial.isPending || !title.trim() || !message.trim()}
                className="bg-blue-600 hover:bg-blue-500"
              >
                {saveMaterial.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
