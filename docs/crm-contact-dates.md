# Datas de contato no CRM

- Última Mensagem Enviada: campo de data opcional, preenchido manualmente ou pelo botão Hoje (calendário local do navegador).
- Data da próxima ação: data/hora manual e atalhos Em 3, 7 e 14 dias a partir de agora, mantendo o horário local.
- Os atalhos alteram o formulário; Salvar persiste as datas. Os campos manuais permanecem visíveis e podem ser limpos.
- O ícone ao lado do título copia o nome completo do negócio.

## Persistência e publicação

Aplicar `20261028180000_add_crm_last_message_on.sql` no banco usado pela API CRM antes de atualizar o SQL da API e publicar o frontend. A coluna `last_message_on` é uma data anulável; não há preenchimento retroativo. O antigo texto `next_action` permanece no banco e continua aceito para clientes antigos. O novo formulário não o sobrescreve.

A API usa `n8n/crm-api.sql` no nó Executar operação no CRM do workflow `32lb2vSB5uHCdq3x`. A listagem já inclui a nova coluna. O trigger atualiza a data da última modificação quando a data da mensagem muda.

## Validação em 28/10/2026

- 48 testes Node aprovados e build de produção aprovado.
- Teste transacional com rollback: gravação, limpeza, compatibilidade com clientes antigos, preservação dos outros campos e bloqueio de gravação não autorizada (execução n8n 430084).
- Migração aplicada com comparação de quantidade e hash dos registros: 660 leads preservados, sem alteração dos valores existentes (execução 430087).

O helper temporário de verificação foi criado no projeto pessoal Felipe Matos, sem agendamento ou webhook, e deve ficar arquivado após a publicação.
