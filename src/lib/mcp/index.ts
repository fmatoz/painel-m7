import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listWorkflowsTool from "./tools/list_workflows";

// Direct Supabase issuer — required by mcp-js (RFC 8414). The .lovable.cloud
// proxy form advertises a different issuer in its discovery document and would
// be rejected. VITE_SUPABASE_PROJECT_ID is inlined at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "painel-automacoes-mcp",
  title: "Painel de Automações MCP",
  version: "0.1.0",
  instructions:
    "Ferramentas do Painel de Automações. Use `list_workflows` para listar os workflows do usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listWorkflowsTool],
});
