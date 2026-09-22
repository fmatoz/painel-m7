# Correção de Vendas e Comissão — 22/09/2026

## Causa verificada
O login usa o Supabase configurado no cliente. O CRM já usa o webhook
`m7-crm/api` e a conexão Postgres do n8n. Vendas e Comunicado consultavam
`team_settings` e `sdr_sales` diretamente pela conexão do login, onde a API
retornava tabela ausente. Não alterar a URL global do Supabase para corrigir isso.

## Escopo
- Frontend: somente as operações de vendas/configuração em Início e Vendas.
- Nova API independente: `m7-sales/api`, workflow `vEkEiZ10faCfva34`.
- Workflow do CRM `32lb2vSB5uHCdq3x`, financeiro e login: inalterados.
- Migração `20260922010000_route_sales_through_verified_backend.sql` aplicada
  no banco da conexão Postgres do n8n, após teste com ROLLBACK e autorização explícita.
- As três FKs de identidade continuam impostas: apontam para o registro privado
  de identidades verificadas pelo login real. Não foram removidas vendas nem leads.
- A função privada é executável apenas pela conexão privilegiada do backend.
  Não é RPC para usuários autenticados, anônimos ou service_role.
- Sessão e permissões são consultadas no servidor; flags enviadas pelo navegador
  nunca definem identidade ou privilégio.
- Cada venda grava a comissão vigente no banco. Mudanças posteriores não
  recalculam vendas anteriores.
- O workflow não armazena execuções bem-sucedidas, erros ou testes manuais com tokens.
- Aviso do validador: apikey literal nas duas consultas ao Supabase. Trata-se
  exclusivamente da chave **publishable**, já pública no cliente, e não de
  service_role/segredo. A autorização depende também do JWT verificado.
- Diagnóstico temporário `Ghkegpkfye1F8GP6` arquivado, com última versão somente leitura.

## Verificação
- Build de produção e lint dos arquivos alterados aprovados.
- `node --test tests/sales-authorizer.test.mjs`: 7 testes aprovados.
- `tests/sales-backend.sql`, executado em transação com ROLLBACK:
  FKs e permissões privadas, identidade do vendedor, comissão 20%/15%, preservação
  histórica, isolamento entre SDRs, aprovação exclusiva do administrador,
  exclusão de pendentes pelo titular, validação de valores e contas inativas.
- Leituras autenticadas no endpoint publicado: configurações OK (15%), vendas OK,
  CRM OK (239 leads).
- Endpoint publicado recusou sessão inválida mesmo com flags de administrador
  forjadas; recusou comissão 101% e venda negativa, sem gravar dados de teste.

## Manutenção
O arquivo `n8n/sales-api.workflow.js` é a definição SDK versionada, não um módulo
do frontend. A publicação do frontend é feita pelo GitHub/Vercel.
Para reaplicar a migração, usar transação BEGIN/COMMIT no banco já usado pelo CRM;
não criar outro projeto de login. Nunca executar testes sem BEGIN/ROLLBACK.
A migração não deve ser aplicada automaticamente em outro banco.

