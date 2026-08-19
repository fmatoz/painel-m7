import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

type Workflow = {
  id: string;
  name: string;
  status: "ativo" | "inativo";
};

const MOCK_WORKFLOWS: Workflow[] = [
  { id: "WF-001", name: "Integração CRM", status: "ativo" },
  { id: "WF-002", name: "Notificação de Vendas", status: "inativo" },
  { id: "WF-003", name: "Atualização de Planilha", status: "ativo" },
  { id: "WF-004", name: "Backup Automático", status: "ativo" },
];

export default defineTool({
  name: "list_workflows",
  title: "Listar workflows",
  description:
    "Lista os workflows do Painel de Automações do usuário autenticado, com filtro opcional por status.",
  inputSchema: {
    status: z
      .enum(["todos", "ativo", "inativo"])
      .optional()
      .describe("Filtro opcional de status. Padrão: todos."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Não autenticado." }],
        isError: true,
      };
    }

    const filter = status ?? "todos";
    const items =
      filter === "todos"
        ? MOCK_WORKFLOWS
        : MOCK_WORKFLOWS.filter((w) => w.status === filter);

    return {
      content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      structuredContent: { workflows: items, count: items.length },
    };
  },
});
