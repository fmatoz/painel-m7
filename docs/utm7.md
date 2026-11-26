# UTM7

Painel privado em `/utm7`, no mesmo projeto do Painel M7, com autenticação e PostgreSQL próprios na VPS. O e-mail e a senha do proprietário foram preservados por migração do hash, sem acessar a senha em texto. O UTM7 não faz chamadas ao Supabase. O restante do M7 mantém seu login existente.

## Funcionalidades

- Visão geral: receita confirmada, investimento, lucro estimado, CPA, ROAS e ROI.
- Campanhas, conjuntos e anúncios: navegação por nível, filtro de oferta/conta/período, busca, ordenação e CSV. “Somente ativos” usa o status efetivo da Meta, excluindo pausas herdadas e eventos sem status; não altera a veiculação na Meta. O filtro afeta a tabela e seus totais, preservando a visão geral do período.
- Colunas configuráveis em janela: arrastar ou mover por setas, exibir/ocultar e restaurar o padrão. Nome fixo à esquerda; veiculação e orçamento também podem ser reposicionados. Cabeçalho, linhas, totais e CSV seguem a mesma ordem. Preferências salvas no navegador, com migração da seleção anterior.
- Tema escuro por padrão, alternância para claro e preferência persistente. Paleta roxa/azul e símbolo oficial da M7 já presente no projeto; estilos limitados ao UTM7 e suas janelas.
- “Organizar painel” na visão geral permite gráfico/funil lado a lado em qualquer ordem ou um acima do outro. Padrão: gráfico à esquerda e funil à direita em desktop; abaixo de 1151px os cards são empilhados. A ordem também muda no DOM, e a preferência é salva no navegador. Verificação de interface cobriu os quatro modos, recarga e celular.
- Métricas: orçamento diário, status, compras, CPA, reproduções de 3s, taxa de gancho, frequência, gasto, impressões, CPM, cliques no link, CPC, CTR, visualizações de LP da Meta e seus custos/taxas, visitas únicas registradas, IC e custo por IC.
- Funil horizontal contínuo, com transições suaves, percentuais sobre a primeira etapa e volumes abaixo. Com Meta conectada usa cliques, visualizações de página da Meta, IC e compras aprovadas do Sheets; sem Meta usa visitas únicas, IC e compras. A espessura acompanha os volumes reais, inclusive se uma etapa crescer. Base zero produz taxa indisponível, sem inventar 100%. Rolagem no celular fica dentro do card. Marcos da VSL: play, 25%, 50%, 75% e conclusão.
- Cadastro persistente de ofertas: produto, preço de referência, custo por venda, links, pixel, nomes recebidos na planilha e IDs das campanhas. Arquivar não apaga histórico.
- Cadastro de contas Meta por ID e token da Marketing API. O token fica em armazenamento privado no servidor e não é retornado à interface.
- Orçamento diário de conjunto (ABO): confirmação explícita, conferência do valor atual na Meta, validação de conta e conjunto, idempotência por solicitação e histórico. Não converte CBO/orçamento vitalício nem muda status.
- Seleção de até 50 itens visíveis em campanhas, conjuntos e anúncios, excluindo eventos sem ID. Ativar/pausar exige revisão dos itens e confirmação; cada pedido verifica conta, ID e status efetivo atual na Meta, rejeita conflitos e não ativa pais pausados implicitamente. Sucesso significa confirmação da alteração pela API, não garantia de entrega do anúncio.
- Orçamento em massa define um valor absoluto por conjunto. Quando anúncios são selecionados, os conjuntos pais são deduplicados e exibidos na revisão, com aviso de que outros anúncios desses conjuntos compartilham o valor. A edição de orçamento continua restrita a conjuntos com orçamento diário (ABO).
- Execução em massa sequencial, resultado por item e nova tentativa manual somente dos não confirmados. Solicitações usam IDs novos, confirmação explícita e verificação de estado atual. A seleção é limpa ao trocar de nível, conta, oferta, período ou filtro. O painel sincroniza a Meta ao concluir.

## Fontes e atualização

O navegador usa `/api/utm7/session`, `/api/utm7/auth` e `/api/utm7/data` na mesma origem. O proxy em `src/server.ts` entrega as chamadas aos fluxos `UTM7 | Login próprio na VPS` (`RHLjLIXvNFPCF1jG`) e `UTM7 | API própria na VPS` (`5JRS2vIFdIgKIokC`). Ambos acessam o serviço privado `http://utm7-gateway:8080`, acessível apenas nas redes Docker. A API retorna dados agregados, sem nomes, e-mails, documentos ou IDs persistentes dos visitantes.

O Sheets central continua sendo `1AlhIIhi8NXxImk5TB_GDLpRNvtpi96SpFN0lv8Cd8ww`, abas `tracking` e `vendas`, via credencial já existente no n8n. A leitura ocorre a cada minuto enquanto o painel está aberto. Nenhuma rotina de captura foi substituída.

A Marketing API v25.0 fornece entidades, orçamentos e insights. A sincronização usa paginação com limite explícito; se o limite for atingido, o relatório não é salvo como completo. Os relatórios ficam em cache por conta e intervalo. A interface consulta a Meta ao abrir um intervalo sem cache, e renova dados com mais de dez minutos enquanto aberta. Há também sincronização manual. Não há processo periódico com o painel fechado nesta versão.

Reconquiste já está associado à campanha `120255050101070580`, conta `233896209622152` (nome consultado: CONTA 01), aos cinco conjuntos de R$ 10/dia e ao pixel `1795323998419205`. A conexão da Marketing API foi reutilizada do fluxo de gastos existente no n8n; não é o token de CAPI do pixel.

## Critérios dos números

- Compras: evento `purchase` com pagamento aprovado e valor positivo, uma vez por `payment_id`. Pagamentos pendentes e diagnósticos não contam como venda.
- Estornos/chargebacks: um evento de reversão por pagamento, na data registrada no Sheets. As datas dependem do tratamento realizado pelo webhook de origem. A receita bruta original permanece visível; a reversão reduz a receita líquida.
- Visitas: PageViews brutos são preservados. Visitas únicas são deduplicadas por oferta, dia e ID persistente de navegador `__vid_`. Sem esse ID, entram somente nos PageViews brutos e na indicação de qualidade.
- IC: clique no botão da oferta, deduplicado por oferta, dia e navegador; sem ID persistente, usa a sessão/click_id. Não representa pagamento aprovado.
- Compras iniciadas: tentativas de pagamento notificadas pelo checkout, como `pix_gerado`, `payment_refused`, `payment_declined` ou `payment_rejected`. Estados pendentes/processando/autorizados também contam; pagamento aprovado comprova uma tentativa quando não há notificação anterior. Cada `payment_id` conta uma vez, na data da primeira ocorrência recebida, independentemente de reenvios ou mudanças de status. Carrinho abandonado, cancelamento isolado, estorno isolado e diagnósticos não criam uma tentativa. Esta etapa depende das notificações de pagamento enviadas pela plataforma; não usa cliques da LP como substituto.
- Sequência do funil com Meta: cliques → visualizações da página → IC → compras iniciadas → compras aprovadas. IC e compras iniciadas têm colunas e custos próprios. O total filtrado recalcula esses custos a partir dos volumes. Datas distintas ou novas tentativas com IDs diferentes podem fazer o funil crescer entre etapas; não se forçam os valores para produzir uma queda artificial.
- Atribuição: IDs em `utm_campaign`, `utm_term` e `utm_content`; a venda pode herdar os IDs de uma visita com o mesmo `click_id`. Nenhuma atribuição é inventada para vendas sem correspondência.
- Mapeamento explícito de campanhas na oferta tem prioridade. Sem ele, as campanhas são identificadas pelas UTMs recebidas para os nomes cadastrados. Campanhas compartilhadas por ofertas não permitem dividir investimento sem critérios adicionais; cadastre campanhas distintas para comparar ofertas.
- CPC = investimento / cliques no link; CTR = cliques no link / impressões; CPM = investimento × 1.000 / impressões.
- CPA = investimento / compras aprovadas; ROAS = receita bruta / investimento.
- Lucro estimado = receita bruta − taxas registradas − estornos − custo por venda cadastrado − mídia. Não inclui impostos ou despesas não informadas.
- ROI = lucro estimado / investimento × 100. Não é sinônimo de ROAS.
- Frequência vem do relatório exato por nível/período da Meta. Não se somam frequências diárias ou de anúncios para fabricar frequência total.
- Taxa de gancho = reproduções de 3s / impressões. Os vídeos atuais têm duração superior a 3s.
- Divisão por zero aparece como indisponível (`—`), não como custo ou retorno zero.
- O Sheets usa datas registradas em Brasília; os insights seguem o fuso da conta de anúncios. A janela de atribuição da Meta pode divergir do pagamento por clique no Sheets.
- Fontes distintas são identificadas nas colunas: visitas únicas do rastreamento e visualizações da LP informadas pela Meta não são a mesma medida.

## Novas ofertas e contas

1. Em Minhas ofertas, cadastre produto, pixel, preço, URLs e nomes exatos utilizados em `offer_name`/`product_title` na planilha.
2. Informe os IDs das campanhas quando quiser um vínculo explícito, mesmo antes de chegar a primeira visita.
3. Em Integrações, cadastre uma conta de anúncios em BRL e token com `ads_read`. Edição de orçamento requer `ads_management` e acesso à conta.
4. Use os mesmos parâmetros dinâmicos nos anúncios:

```text
utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}
```

O cadastro de pixel no UTM7 é um registro da oferta: não instala pixel, cria datasets ou configura CAPI/webhook de novas LPs automaticamente. Novos produtos precisam enviar eventos e vendas à fonte central. O painel não traz editor de regras automáticas nesta versão.

## Armazenamento e segurança

`n8n/utm7-storage.sql` cria o schema privado `utm7`, tabelas de ofertas, conexões, cache e auditoria e as funções autorizadoras. RLS está habilitado e os papéis `PUBLIC`, `anon` e `authenticated` não têm acesso às tabelas/funções desse schema. Não se habilitou acesso público a tabelas do CRM.

A pasta `utm7-server/` contém o serviço Node e o Compose do banco PostgreSQL 17 isolado. Na VPS fica em `/opt/utm7`, sem portas públicas, com volume persistente `utm7_data`. O gateway tem filesystem somente leitura, limite de memória de 256 MB e acesso ao banco apenas pela rede privada. O banco tem limite de 512 MB. Segredos ficam em `/opt/utm7/private`, fora do Git; não são necessários segredos novos na Vercel.

As senhas novas usam scrypt com salt aleatório. O hash bcrypt importado é validado com pgcrypto e atualizado para scrypt no login quando a senha tem pelo menos 12 caracteres. Cada login tem até cinco tentativas por janela de 15 minutos. Contas desconhecidas compartilham um bucket limitado, evitando criar registros ilimitados. Ativações administrativas expiram e só podem ser usadas uma vez.

Sessões duram até oito horas e ficam no cookie `__Host-utm7_session`, HttpOnly, Secure e SameSite=Strict. O banco guarda apenas o hash do token. Cada operação revalida expiração, revogação, usuário ativo e administrador; a identidade enviada pelo cliente é descartada. O proxy rejeita mutações sem Origin igual à origem do painel. Sair revoga a sessão no banco. A identidade privada para as funções SQL é derivada exclusivamente dessa sessão, nunca de `public.app_users` ou de flags do navegador.

`utm7.status_audit` registra cada solicitação de ativação/pausa, usuário, alvo, estado esperado, estado anterior e resultado. RLS e revogação de acesso público também se aplicam a essa tabela e a `finish_status`. A API só aceita `ACTIVE`/`PAUSED`, sem exclusão ou arquivamento. Erros e timeouts ficam não confirmados e pedem sincronização antes de nova tentativa; o backend não repete POSTs automaticamente. Status confirmado invalida o cache da conexão. Referências oficiais: [anúncios](https://developers.facebook.com/docs/marketing-api/reference/ad-group), [conjuntos](https://developers.facebook.com/docs/graph-api/reference/ad-campaign/) e [campanhas](https://developers.facebook.com/docs/marketing-api/reference/adcampaigngroup/).

Históricos de sucesso, erro e execuções manuais dos novos fluxos estão desativados para não registrar senhas e tokens. O navegador não persiste tokens Meta nem dados pessoais de compradores. O provider Supabase do M7 é carregado somente fora da rota UTM7. Os fluxos de captura da LP e de vendas permanecem independentes e inalterados.

`backup.sh` gera um dump diário às 03:17 UTC, verifica o catálogo com `pg_restore --list` e mantém 14 dias em `/opt/utm7/private/backups`. O backup fica na própria VPS; não protege contra perda completa do servidor. Restauração: desativar tráfego do UTM7, restaurar o dump em banco limpo e iniciar o mesmo Compose. O banco antigo e o fluxo antigo são preservados para rollback, sem dependência ativa após a troca.

## Migração independente — 26/11/2026

- Dados de ofertas, conexões, relatórios e auditorias migrados com contagem e fingerprint iguais antes do commit da transação.
- Hash do proprietário verificado por fingerprint; a senha em texto não foi acessada.
- 101 testes Node e TypeScript passaram; build de produção concluído.
- QA real no PostgreSQL cobriu login, limite de tentativas, hash de sessão, expiração, revogação, mudança de permissão, migração bcrypt e identidade forjada.
- Chromium isolado cobriu login real, Sheets e Meta reais, cookie HttpOnly, recarga, campanhas, organização, celular e logout. Nenhuma chamada ao Supabase mesmo com uma sessão antiga expirada no localStorage.
- Conta de QA usa credencial aleatória temporária e é removida após a validação. Nenhuma senha do proprietário ou sessão do seu navegador pessoal foi usada. Alterações em anúncios continuam sendo testadas com API simulada.

## Verificações anteriores da interface e dos cálculos

- 90 testes Node: regressão do M7, cálculos, deduplicação/atribuição, guardas de orçamento/autorização, preferências e contraste; inclui conflitos/escopo de status, pais pausados, deduplicação de conjuntos, execução sequencial com falha parcial e geometria/taxas do funil.
- TypeScript e build de produção passaram.
- Fontes reais: leitura do Sheets, consulta da conta Meta e dos cinco conjuntos/anúncios, sincronização e persistência do cache, dashboard autorizado executado internamente por MCP.
- SQL real com transação revertida: negação sem administrador, ausência de token na resposta, exigência de confirmação, rejeição de pixel inválido, deduplicação da solicitação, preservação de token vazio na edição e revogação de acesso público. Nenhum registro de QA de orçamento foi mantido.
- API n8n corrigida: sessão inválida, inclusive com ID e flags de administrador forjados no corpo, recebe 401 sem dados; CORS permite a origem do M7.
- Chromium headless isolado: redirecionamento ao login, UI desktop/mobile, os cinco conjuntos, filtro por nível, colunas, CSV, cadastro de oferta/pixel e modal de orçamento. Sem controle do navegador ou perfil pessoal do usuário.
- As chamadas de escrita da Meta nos testes de interface foram simuladas. Não se alteraram orçamentos reais apenas para testar. O caminho de escrita exige confirmação no painel e será confirmado pela API da Meta quando utilizado.
- O teste visual autenticado usa uma sessão simulada e agregados reais, somente no ambiente de QA. Não se criou login temporário nem se extraiu a sessão do navegador pessoal. Esse teste inicial não detectou a divergência de IDs porque o SQL de QA usava o cadastro legado. A regressão agora usa o ID atual verificado independentemente, rejeita o ID legado, testa expiração/revogação e reverte as alterações de QA.
- Após publicar a correção, uma requisição real do login existente passou pela validação da sessão e do perfil ativo; confirmada por `verified_at` no armazenamento privado, sem capturar o JWT nem habilitar históricos com dados sensíveis.
- Atualização visual: Chromium isolado em desktop e celular verificou arraste, setas, visibilidade, persistência, ordem equivalente no CSV, filtro de ativos e totais recalculados, alternância de tema nas janelas e funil gráfico. Sessão/fontes simuladas para testar a interface sem escrever em anúncios ou controlar o navegador pessoal. Teste de contraste verifica as cores de texto/estado contra os três fundos em ambos os temas (mínimo 4,5:1).
- Edição em massa: testes de interface com API simulada verificam ausência de envio antes da confirmação, valores em centavos, total diário da revisão, um POST por conjunto compartilhado, falha parcial e repetição somente dos itens não confirmados. Testes SQL no banco real são revertidos e não enviam POST à Meta. Leituras reais de campanha, conjunto e anúncio validaram os campos e pais usados pela guarda. Nenhuma veiculação ou orçamento real foi alterado para testar a implementação.

O gerador `n8n/build-utm7-workflow.mjs` produz `n8n/utm7-vps-api.workflow.js`. O fluxo de login está em `n8n/utm7-own-auth.workflow.js`. Após alterações no motor ou nas guardas, regenere e valide no SDK e atualize os respectivos nodes do ID ativo. O antigo `n8n/utm7-api.workflow.js` é apenas referência de rollback.

