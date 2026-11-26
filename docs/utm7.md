# UTM7

Painel privado em `/utm7`, no mesmo projeto do Painel M7. O login existente é preservado. A API exige sessão Supabase válida e um registro `app_users` ativo com `is_admin=true`; a proteção não depende apenas da interface.

## Funcionalidades

- Visão geral: receita confirmada, investimento, lucro estimado, CPA, ROAS e ROI.
- Campanhas, conjuntos e anúncios: navegação por nível, filtro de oferta/conta/período, busca, ordenação e CSV. “Somente ativos” usa o status efetivo da Meta, excluindo pausas herdadas e eventos sem status; não altera a veiculação na Meta. O filtro afeta a tabela e seus totais, preservando a visão geral do período.
- Colunas configuráveis em janela: arrastar ou mover por setas, exibir/ocultar e restaurar o padrão. Nome fixo à esquerda; veiculação e orçamento também podem ser reposicionados. Cabeçalho, linhas, totais e CSV seguem a mesma ordem. Preferências salvas no navegador, com migração da seleção anterior.
- Tema escuro por padrão, alternância para claro e preferência persistente. Paleta roxa/azul e símbolo oficial da M7 já presente no projeto; estilos limitados ao UTM7 e suas janelas.
- Métricas: orçamento diário, status, compras, CPA, reproduções de 3s, taxa de gancho, frequência, gasto, impressões, CPM, cliques no link, CPC, CTR, visualizações de LP da Meta e seus custos/taxas, visitas únicas registradas, IC e custo por IC.
- Funil gráfico de compra em quatro etapas, com volumes e taxas de IC/aprovação, e marcos da VSL: play, 25%, 50%, 75% e conclusão. As faixas ilustram a sequência, sem fabricar proporcionalidade entre cliques da Meta e visitas de todas as fontes; etapas zeradas permanecem identificadas.
- Cadastro persistente de ofertas: produto, preço de referência, custo por venda, links, pixel, nomes recebidos na planilha e IDs das campanhas. Arquivar não apaga histórico.
- Cadastro de contas Meta por ID e token da Marketing API. O token fica em armazenamento privado no servidor e não é retornado à interface.
- Orçamento diário de conjunto (ABO): confirmação explícita, conferência do valor atual na Meta, validação de conta e conjunto, idempotência por solicitação e histórico. Não converte CBO/orçamento vitalício nem muda status.

## Fontes e atualização

O backend `UTM7 | API privada de atribuição` (`t1XMLvMZkea4Vz0t`) atende `POST /webhook/m7-utm7/api` no n8n. A sessão é validada em `/auth/v1/user` e o perfil é consultado em `/rest/v1/app_users` **no mesmo Supabase do login M7**, a cada pedido. O perfil deve pertencer exatamente ao ID autenticado e ter `active=true` e `is_admin=true`. A API retorna dados agregados, sem nomes, e-mails, documentos ou IDs persistentes dos visitantes.

O Sheets central continua sendo `1AlhIIhi8NXxImk5TB_GDLpRNvtpi96SpFN0lv8Cd8ww`, abas `tracking` e `vendas`, via credencial já existente no n8n. A leitura ocorre a cada minuto enquanto o painel está aberto. Nenhuma rotina de captura foi substituída.

A Marketing API v25.0 fornece entidades, orçamentos e insights. A sincronização usa paginação com limite explícito; se o limite for atingido, o relatório não é salvo como completo. Os relatórios ficam em cache por conta e intervalo. A interface consulta a Meta ao abrir um intervalo sem cache, e renova dados com mais de dez minutos enquanto aberta. Há também sincronização manual. Não há processo periódico com o painel fechado nesta versão.

Reconquiste já está associado à campanha `120255050101070580`, conta `233896209622152` (nome consultado: CONTA 01), aos cinco conjuntos de R$ 10/dia e ao pixel `1795323998419205`. A conexão da Marketing API foi reutilizada do fluxo de gastos existente no n8n; não é o token de CAPI do pixel.

## Critérios dos números

- Compras: evento `purchase` com pagamento aprovado e valor positivo, uma vez por `payment_id`. Pagamentos pendentes e diagnósticos não contam como venda.
- Estornos/chargebacks: um evento de reversão por pagamento, na data registrada no Sheets. As datas dependem do tratamento realizado pelo webhook de origem. A receita bruta original permanece visível; a reversão reduz a receita líquida.
- Visitas: PageViews brutos são preservados. Visitas únicas são deduplicadas por oferta, dia e ID persistente de navegador `__vid_`. Sem esse ID, entram somente nos PageViews brutos e na indicação de qualidade.
- IC: clique no botão da oferta, deduplicado por oferta, dia e navegador; sem ID persistente, usa a sessão/click_id. Não representa pagamento aprovado.
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

A API usa a credencial Postgres existente no n8n. A chave Supabase `sb_publishable_*` presente no fluxo é pública e serve para validar a sessão do usuário; não é uma service-role key. O alerta estático de "apikey hardcoded" do validador se refere a essa chave pública já usada pelo M7.

O banco de métricas contém um `public.app_users` legado com IDs diferentes dos usuários do Supabase atual. Ele **não** autoriza acesso ao UTM7. O Code node incorpora `src/lib/utm7-auth.mjs` e produz a identidade/permissão somente a partir das duas respostas HTTP verificadas; campos enviados pelo navegador não substituem essa decisão. Sessão inválida recebe 401; perfil ausente, inativo ou sem permissão recebe 403.

`utm7.authorize_and_dispatch` recebe exclusivamente essa decisão do servidor e mantém `utm7.admin_identities`, sem acesso público, para as etapas SQL seguintes do mesmo fluxo. A identidade expira após cinco minutos e é desativada quando uma nova consulta nega a permissão. Esse registro não substitui a consulta do Supabase: cada pedido público passa novamente pelas duas verificações. Nenhum cadastro compartilhado do CRM foi alterado.

Históricos de sucesso/erro da API em produção estão desativados, evitando registrar tokens enviados ao cadastrar conexões. O navegador não persiste tokens Meta nem dados pessoais de compradores. Autenticação M7 permanece sob controle do Supabase.

## Verificação — 26/11/2026

- 84 testes Node passaram: regressão do M7, cálculos, datas, deduplicação, diagnósticos, atribuição, taxas, estornos, guardas de orçamento, sete casos de identidade/permissão e cinco casos de preferências, filtro/totais e contraste do UTM7.
- TypeScript e build de produção passaram.
- Fontes reais: leitura do Sheets, consulta da conta Meta e dos cinco conjuntos/anúncios, sincronização e persistência do cache, dashboard autorizado executado internamente por MCP.
- SQL real com transação revertida: negação sem administrador, ausência de token na resposta, exigência de confirmação, rejeição de pixel inválido, deduplicação da solicitação, preservação de token vazio na edição e revogação de acesso público. Nenhum registro de QA de orçamento foi mantido.
- API n8n corrigida: sessão inválida, inclusive com ID e flags de administrador forjados no corpo, recebe 401 sem dados; CORS permite a origem do M7.
- Chromium headless isolado: redirecionamento ao login, UI desktop/mobile, os cinco conjuntos, filtro por nível, colunas, CSV, cadastro de oferta/pixel e modal de orçamento. Sem controle do navegador ou perfil pessoal do usuário.
- As chamadas de escrita da Meta nos testes de interface foram simuladas. Não se alteraram orçamentos reais apenas para testar. O caminho de escrita exige confirmação no painel e será confirmado pela API da Meta quando utilizado.
- O teste visual autenticado usa uma sessão simulada e agregados reais, somente no ambiente de QA. Não se criou login temporário nem se extraiu a sessão do navegador pessoal. Esse teste inicial não detectou a divergência de IDs porque o SQL de QA usava o cadastro legado. A regressão agora usa o ID atual verificado independentemente, rejeita o ID legado, testa expiração/revogação e reverte as alterações de QA.
- Após publicar a correção, uma requisição real do login existente passou pela validação da sessão e do perfil ativo; confirmada por `verified_at` no armazenamento privado, sem capturar o JWT nem habilitar históricos com dados sensíveis.
- Atualização visual: Chromium isolado em desktop e celular verificou arraste, setas, visibilidade, persistência, ordem equivalente no CSV, filtro de ativos e totais recalculados, alternância de tema nas janelas e funil gráfico. Sessão/fontes simuladas para testar a interface sem escrever em anúncios ou controlar o navegador pessoal. Teste de contraste verifica as cores de texto/estado contra os três fundos em ambos os temas (mínimo 4,5:1).

O gerador `n8n/build-utm7-workflow.mjs` produz `n8n/utm7-api.workflow.js` para validar no SDK do n8n. Após alterações no motor ou nas guardas, regenere o fluxo e atualize os respectivos Code nodes. Não importe o fluxo gerado como novo workflow a cada alteração: mantenha o ID ativo.
