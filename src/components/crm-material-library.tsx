import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clipboard,
  FileText,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Tables } from "@/integrations/supabase/types";

type Material = Tables<"crm_materials">;
type AuthorFilter = "all" | "mine" | string;

type Props = {
  accessToken: string;
  currentUserId: string;
  isAdmin: boolean;
};

const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const editDistance = (left: string, right: string) => {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const previous = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return row[right.length];
};

const fuzzyIncludes = (material: Material, rawQuery: string) => {
  const query = normalizeSearch(rawQuery);
  if (!query) return true;
  const searchable = normalizeSearch(
    [material.title, material.message, material.author_name].join(" "),
  );
  if (searchable.includes(query)) return true;
  const words = searchable.split(" ").filter(Boolean);
  return query.split(" ").every((term) =>
    words.some((word) => {
      if (word.includes(term) || term.includes(word)) return true;
      if (term.length < 4 || Math.abs(word.length - term.length) > 2) return false;
      return editDistance(word, term) <= (term.length >= 7 ? 2 : 1);
    }),
  );
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
  const [searchQuery, setSearchQuery] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("crm-material-favorites:" + currentUserId);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
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

  const filtered = useMemo(() => {
    const favorites = new Set(favoriteIds);
    return (materialsQuery.data ?? [])
      .filter(
        (item) =>
          (authorFilter === "all" ||
            (authorFilter === "mine" && item.created_by === currentUserId) ||
            item.created_by === authorFilter) &&
          fuzzyIncludes(item, searchQuery),
      )
      .sort((left, right) => {
        const favoriteDifference = Number(favorites.has(right.id)) - Number(favorites.has(left.id));
        if (favoriteDifference !== 0) return favoriteDifference;
        return right.updated_at.localeCompare(left.updated_at);
      });
  }, [materialsQuery.data, authorFilter, currentUserId, favoriteIds, searchQuery]);

  const toggleFavorite = (id: string) => {
    setFavoriteIds((current) => {
      const next = current.includes(id)
        ? current.filter((favoriteId) => favoriteId !== id)
        : [...current, id];
      localStorage.setItem("crm-material-favorites:" + currentUserId, JSON.stringify(next));
      return next;
    });
  };
  const openNew = () => {
    setSelected(null);
    setTitle("");
    setMessage("");
    setEditing(true);
    setDialogOpen(true);
  };

  const openMaterial = (item: Material) => {
    setSelected(item);
    setTitle(item.title);
    setMessage(item.message);
    setEditing(false);
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
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <div className="relative min-w-52 flex-1 sm:w-72 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar nos materiais..."
              aria-label="Buscar materiais por título ou conteúdo"
              className="border-zinc-700 bg-zinc-900 pl-9 text-zinc-200"
            />
          </div>
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
          {filtered.map((item) => {
            const isFavorite = favoriteIds.includes(item.id);
            return (
              <div
                key={item.id}
                className="group relative aspect-square min-h-36 rounded-xl border border-zinc-800 bg-zinc-900 transition hover:-translate-y-0.5 hover:border-blue-500/70 hover:bg-zinc-800"
              >
                <button
                  type="button"
                  onClick={() => openMaterial(item)}
                  className="h-full w-full rounded-xl p-4 text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <span className="flex h-full items-center justify-center px-2 pb-5 text-center font-semibold leading-snug text-zinc-100">
                    {item.title}
                  </span>
                  <span className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] truncate text-[11px] text-zinc-500 group-hover:text-zinc-400">
                    {item.author_name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleFavorite(item.id)}
                  aria-label={
                    isFavorite
                      ? "Remover " + item.title + " dos favoritos"
                      : "Favoritar " + item.title
                  }
                  aria-pressed={isFavorite}
                  className="absolute right-2 top-2 rounded-full p-2 text-zinc-500 transition hover:bg-zinc-700 hover:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <Star
                    className={"h-4 w-4 " + (isFavorite ? "fill-amber-400 text-amber-400" : "")}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-zinc-800 bg-zinc-900 text-white sm:max-w-2xl">
          {selected && canManageSelected && !editing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Opções do material"
                  className="absolute right-12 top-4 rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              >
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-400 focus:bg-red-950 focus:text-red-300"
                  onSelect={() => {
                    if (window.confirm(`Excluir o material “${selected.title}”?`)) {
                      deleteMaterial.mutate(selected.id);
                    }
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-400" />
              {editing && selected
                ? "Editar material"
                : selected
                  ? selected.title
                  : "Novo material"}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {selected
                ? `Criado por ${selected.author_name}`
                : "Adicione um título e o texto completo."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {editing ? (
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
              <div className="whitespace-pre-wrap py-3 text-[15px] leading-7 text-zinc-200">
                {message}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {selected && !editing && (
              <Button
                variant="outline"
                onClick={copyMessage}
                className="border-zinc-700 bg-zinc-950 text-zinc-200"
              >
                <Clipboard className="mr-2 h-4 w-4" />
                Copiar mensagem
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                if (selected && editing) {
                  setTitle(selected.title);
                  setMessage(selected.message);
                  setEditing(false);
                } else {
                  setDialogOpen(false);
                }
              }}
              className="text-zinc-300"
            >
              {selected && editing ? "Cancelar" : "Fechar"}
            </Button>
            {editing && canManageSelected && (
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
