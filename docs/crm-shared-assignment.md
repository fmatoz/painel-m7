# Atendimento compartilhado

- Administrador: **Assumir junto** preserva o responsável original.
- SDR responsável: **Compartilhar com Felipe** acrescenta o destinatário configurado no servidor. Não transfere nem duplica o lead.
- Os dois aparecem no card, nos filtros de responsáveis e no resumo pessoal do Início.
- **Sair do atendimento** remove somente quem clicou. Se o responsável original sair, o primeiro colaborador passa a ocupar o campo principal.
- Cliques repetidos são idempotentes. A operação trava a linha e grava atividade na mesma transação.
- Não altera vendas, comissões, login nem permissões de acesso ao CRM.

## Implantação

1. Testar a migração `20261021120000_add_crm_shared_assignment.sql` e `tests/crm-shared-assignment.sql` dentro de BEGIN/ROLLBACK.
2. Aplicar somente a migração, em transação.
3. Atualizar o SQL do nó **Executar operação no CRM**, workflow `32lb2vSB5uHCdq3x`, com `n8n/crm-api.sql` e publicar.
4. Publicar o frontend. Clientes antigos que enviam `takeover` passam a compartilhar em vez de substituir o responsável.

O destinatário único fica em `m7_private.crm_share_recipient`, sem acesso dos papéis públicos. O identificador inicial é o usuário atual de Felipe no painel, `de5f395b-64eb-45e5-9ec7-1d23aa7bc712`, verificado nos leads existentes. **Não usar o identificador da réplica antiga de app_users deste banco.** Se a conta mudar, atualizar essa configuração após verificar a nova identidade. O cliente não escolhe nem pode forjar o destinatário. Acrescentar um corresponsável não concede acesso ao CRM: cada solicitação continua validando a sessão e as permissões atuais no Supabase de autenticação.

Antes de reverter a API para uma versão anterior, preservar o tratamento das atribuições compartilhadas: o código antigo não conhece colaboradores. A migração é aditiva e não precisa ser removida para reverter somente a interface.
