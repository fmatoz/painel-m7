# Controle da Luana

Página independente em `/luana.html`, sem sessão do Painel M7. O link de acesso usa `#chave=...`; a chave não faz parte da requisição HTTP da página nem do Referer. Ela é enviada somente no corpo POST ao endpoint dedicado e guardada na sessão da aba. Não colocar a chave no repositório, analytics ou query string.

O endpoint `/webhook/canel/luana-control` aceita exclusivamente `status` e `set` para `canel_luana`. Não aceita ID de workflow ou de cliente. A chave de 256 bits é comparada no banco por SHA-256; apenas o hash é armazenado. Os registros de execução deste endpoint devem ficar desabilitados para não guardar a chave recebida.

`set` recebe `enabled` booleano e `expectedVersion` inteiro. Uma versão desatualizada retorna 409. A página não altera o estado visual antes da confirmação e bloqueia o botão após erro até nova consulta.

O fluxo Agente Mestre Rudson consulta a flag global na entrada e antes das saídas automáticas. Flag falsa interrompe a passagem sem enviar mensagem. A flag inicia ativada, respeita o expediente existente e não modifica pausas individuais de conversas. Uma requisição de envio já iniciada no provedor pode terminar mesmo após desativar; os próximos envios são bloqueados.

## Operação

- Para revogar o link, substituir somente `token_hash` de `canel_luana` por SHA-256 de uma nova chave aleatória de 32 bytes em base64url e entregar o novo link ao Rudson.
- Para reverter a integração, republicar a versão anterior do Agente Mestre. A API e a página podem permanecer sem afetar atendimentos se os gates forem removidos.
- O SQL de instalação preserva o estado e a chave existentes em reexecuções (`ON CONFLICT DO NOTHING`). Nunca preencher o marcador de hash com uma chave em texto puro.
- Verificação local: `node --test tests/luana-control.test.mjs`.

A página reutiliza a publicação do repositório `fmatoz/painel-m7`. Não requer alteração de variáveis de ambiente nem acesso anônimo às tabelas públicas do Supabase.
