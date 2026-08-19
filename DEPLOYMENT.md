# Publicação no Lovable

1. Se o projeto original já estiver conectado ao GitHub, copie estas alterações para o repositório dele e envie para a branch padrão (`main`). O Lovable sincroniza essa branch.
2. Para um projeto novo, crie-o primeiro no Lovable e conecte-o ao GitHub; depois substitua os arquivos do repositório criado pelo Lovable por esta pasta e envie para `main`.
3. Aplique as migrations `supabase/migrations/20260819150000_create_dashboard_tabs.sql` e `supabase/migrations/20260819190000_create_home_workspaces.sql` no Supabase conectado ao projeto.
4. Confirme os secrets da Edge Function `n8n-workflows`: `N8N_BASE_URL`, `N8N_API_KEY`, `M7_WEBHOOK_TOKEN` e `ADMIN_EMAILS`.
5. No Supabase Auth, desative novos cadastros por e-mail. Os acessos da equipe devem ser criados manualmente no painel do Supabase e os e-mails autorizados incluídos em `ADMIN_EMAILS`.
6. Faça deploy da Edge Function `n8n-workflows` junto com o frontend.

Depois da publicação, teste: login autorizado, tentativa de login não autorizado, salvamento da página Início em dois navegadores, criação de aba em dois navegadores, atualização automática e alteração de categoria sem remover tags existentes do n8n.
