# Prospecção diária no Início

Um lead é contado na primeira transição para `primeiro_contato`, no dia de Brasília
(`America/Sao_Paulo`). Mover para outra etapa, retornar ou compartilhar não gera
outro evento. O autor é quem executou a movimentação, não o responsável atual.

A tabela privada `m7_private.crm_first_contacts` mantém um evento por lead e
preserva o registro mesmo se o lead for excluído. A migração aproveita a primeira
atividade histórica; registros sem autor ficam sem atribuição. Nunca inferir o
prospector pela atribuição atual ou data da última mensagem.

A API n8n normaliza o pedido, valida a sessão e consulta o acesso. Apenas depois
disso cria o contexto transacional `m7.crm_actor`, consumido pelo trigger durante
o UPDATE. UUID e nome vêm da sessão/perfil verificados. O contexto não é recebido
do corpo do cliente e não persiste entre transações.

`prospecting-summary` aceita `reportDate` no formato YYYY-MM-DD (padrão: hoje).
O servidor aplica os limites do dia e o escopo: administrador recebe total e
agrupamento por autor; SDR recebe somente o próprio total. Nem tabela nem função
privadas são acessíveis diretamente por `anon` ou `authenticated`.

O cartão no Início atualiza a cada minuto enquanto visível, ao recuperar o foco e
pelo botão Atualizar. O seletor permite consultar outros dias. A resposta contém
apenas contagens e nomes, sem baixar leads ou atividades para montar o relatório.
Movimentos individuais e em lote invalidam o cache desse resumo.

## Verificação

- Build de produção e lint dos módulos novos.
- `tests/crm-daily-prospecting.sql`: executar após a migração em transação isolada
  e finalizar com ROLLBACK. Verifica reentrada, autoria, escopo, permissões,
  autoria desconhecida e limites do dia em UTC/Brasília.
- Consulta real de atualização testada em transação revertida: atualização sem
  acesso é negada e a primeira autoria é preservada após nova entrada por outro usuário.
- Endpoint publicado rejeita chamadas sem sessão mesmo com flags de acesso no corpo.

Não criar linhas de teste permanentes no CRM nem enviar mensagens para validar o indicador.
