# Sincronização por pedido do botão

Workflow: `d94lVUYLEgcsaVVe` — M7 CRM - Processar fila de sincronização.

Em 28/10/2026 foi acrescentado o filtro de `n8n/crm-sync-request-filter.json` entre **Buscar sincronização pendente** e **Ler Maps**. O filtro exige um UUID em `command_id`, retornado pela busca transacional de comandos. Respostas vazias ou `{success:true}` não podem prosseguir.

O agendamento de um minuto permanece apenas para buscar pedidos na fila. Sem pedido, não lê Maps/CNPJ, não importa lotes e não altera leads. O botão existente cria o comando; o início da importação pode levar cerca de um minuto. Retentativas de pedidos em processamento continuam como antes.

Não foram alterados a API, o frontend, a atualização dos cards, o compartilhamento de responsáveis ou as regras de importação. A publicação é no n8n; não depende de um novo build da Vercel.

Teste local: `node --test tests/crm-sync-request.test.mjs` cobre ausência de ID, placeholders de sucesso, IDs inválidos e UUID válido. Conferir também uma execução sem pedido no n8n: deve terminar no filtro e não executar **Ler Maps** nem **Salvar lote no CRM**.
