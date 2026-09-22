import { workflow, node, trigger, expr } from "@n8n/workflow-sdk";
const step0 = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.1,
  config: {
    name: "Receber pedido de vendas",
    parameters: {
      httpMethod: "POST",
      path: "m7-sales/api",
      authentication: "none",
      responseMode: "responseNode",
      options: { allowedOrigins: "https://painel-m7.vercel.app" },
    },
  },
  output: [{ json: { body: {} } }],
});
const step1 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Normalizar pedido",
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const incoming=$input.first().json || {};\nlet payload=incoming.body ?? {};\nif(typeof payload==='string'){try {payload=JSON.parse(payload);} catch {payload={};}}\nif(!payload || typeof payload!=='object' || Array.isArray(payload)) payload={};\nreturn [{json:{\n token:String(payload.token||''),\n action:String(payload.action||''),\n saleId:String(payload.saleId||''),\n changes:payload.changes && typeof payload.changes==='object' && !Array.isArray(payload.changes) ? payload.changes : {}\n}}];",
    },
  },
  output: [{ json: { token: "session-token", action: "settings-get", changes: {}, saleId: "" } }],
});
const step2 = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "Validar sessão no Supabase",
    parameters: {
      method: "GET",
      url: "https://dhhkmoubjojvrrixghyt.supabase.co/auth/v1/user",
      authentication: "none",
      sendHeaders: true,
      specifyHeaders: "keypair",
      headerParameters: {
        parameters: [
          { name: "apikey", value: "sb_publishable_Zse2ZhrvbndCTIPtxU7L0g_oOJhUGXB" },
          { name: "Authorization", value: expr("Bearer {{ $json.token }}") },
        ],
      },
      options: {
        response: { response: { neverError: true, responseFormat: "json", fullResponse: true } },
      },
    },
  },
  output: [{ json: { statusCode: 200, body: { id: "00000000-0000-4000-8000-000000000001" } } }],
});
const step3 = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "Consultar acesso do usuário",
    parameters: {
      method: "GET",
      url: "https://dhhkmoubjojvrrixghyt.supabase.co/rest/v1/app_users",
      authentication: "none",
      sendQuery: true,
      specifyQuery: "keypair",
      queryParameters: {
        parameters: [
          { name: "select", value: "user_id,active,can_crm,can_inicio,full_name,email,is_admin" },
          {
            name: "user_id",
            value: expr(
              "eq.{{ $json.statusCode === 200 && $json.body?.id ? $json.body.id : '00000000-0000-0000-0000-000000000000' }}",
            ),
          },
          { name: "limit", value: "1" },
        ],
      },
      sendHeaders: true,
      specifyHeaders: "keypair",
      headerParameters: {
        parameters: [
          { name: "apikey", value: "sb_publishable_Zse2ZhrvbndCTIPtxU7L0g_oOJhUGXB" },
          {
            name: "Authorization",
            value: expr("Bearer {{ $('Normalizar pedido').first().json.token }}"),
          },
        ],
      },
      options: {
        response: { response: { neverError: true, responseFormat: "json", fullResponse: true } },
      },
    },
  },
  output: [{ json: { statusCode: 200, body: [] } }],
});
const step4 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Autorizar vendas e comissão",
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const request=$('Normalizar pedido').first().json;\nconst authResponse=$('Validar sessão no Supabase').first().json || {};\nconst auth=authResponse.statusCode===200 ? authResponse.body || {} : {};\nconst accessResponse=$input.first().json || {};\nconst rows=accessResponse.statusCode===200 && Array.isArray(accessResponse.body) ? accessResponse.body : [];\nconst access=rows.find(row=>row.user_id===auth.id) || {};\nreturn [{json:{\n action:request.action,\n saleId:request.saleId,\n changes:request.changes,\n sessionValid:Boolean(auth.id) && authResponse.statusCode===200,\n active:access.active===true,\n canCrm:access.can_crm===true,\n canInicio:access.can_inicio===true,\n userId:auth.id||'',\n userName:String(access.full_name||auth.user_metadata?.full_name||auth.email||'SDR').trim().slice(0,160),\n isAdmin:access.is_admin===true\n}}];",
    },
  },
  output: [
    {
      json: {
        sessionValid: false,
        active: false,
        canCrm: false,
        canInicio: false,
        isAdmin: false,
        userId: "",
        action: "settings-get",
        changes: {},
      },
    },
  ],
});
const step5 = node({
  type: "n8n-nodes-base.postgres",
  version: 2.6,
  config: {
    name: "Executar vendas e comissão",
    parameters: {
      operation: "executeQuery",
      query: "SELECT m7_private.sales_api($1::jsonb) AS response;",
      options: { queryReplacement: expr("{{ JSON.stringify($json) }}"), queryBatching: "single" },
    },
    credentials: { postgres: { id: "jZl3Efj7Q2gOlBmi", name: "Postgres account" } },
    onError: "continueRegularOutput",
  },
  output: [{ json: { response: { ok: true, data: { commission_rate: 15 } } } }],
});
const step6 = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    name: "Responder ao painel",
    parameters: {
      respondWith: "json",
      responseBody: expr(
        "{{ $json.response || {ok:false,error:'Não foi possível concluir a operação de vendas. Tente novamente.'} }}",
      ),
      options: {
        responseCode: 200,
        responseHeaders: {
          entries: [
            { name: "Access-Control-Allow-Origin", value: "https://painel-m7.vercel.app" },
            { name: "Cache-Control", value: "no-store" },
            { name: "Content-Type", value: "application/json" },
          ],
        },
      },
    },
  },
  output: [{ json: {} }],
});
export default workflow("m7-sales-api", "M7 - Vendas e comissão seguras")
  .add(step0)
  .to(step1)
  .to(step2)
  .to(step3)
  .to(step4)
  .to(step5)
  .to(step6);
