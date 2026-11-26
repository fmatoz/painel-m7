import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.dirname(fileURLToPath(import.meta.url));
const nodes = [],
  links = [];
const e = (s) => "=" + s;
const ref = (n) => `$('${n}').first().json`;
const normal = "Normalizar pedido UTM7",
  db = "Consultar armazenamento UTM7",
  auth = "Validar sessão própria",
  gate = "Identificar usuário autenticado";
function add(id, type, version, name, parameters, extra = {}) {
  nodes.push({ id, type, version, config: { name, parameters, ...extra }, output: [{}] });
  return id;
}
function code(id, name, js) {
  return add(id, "n8n-nodes-base.code", 2, name, {
    mode: "runOnceForAllItems",
    language: "javaScript",
    jsCode: js,
  });
}
function connect(a, b, output) {
  links.push({ a, b, output });
}
function sql(id, name, query, values) {
  const operation={dispatch:"dispatch",save:"save_report",audit:"finish_budget",statusAudit:"finish_status"}[id];
  const body=id==="dispatch" ? `{operation:"dispatch",token:${ref(normal)}.token,payload:${ref(gate)}.payload}` : `{...$json,operation:"${operation}",token:${ref(normal)}.token}`;
  return add(id,"n8n-nodes-base.httpRequest",4.5,name,{
    method:"POST",url:"http://utm7-gateway:8080/operation",authentication:"none",sendBody:true,specifyBody:"json",jsonBody:e(`{{ ${body} }}`),
    options:{response:{response:{neverError:true,responseFormat:"json"}},timeout:20000}
  });
}
const request = `${ref(gate)}.payload`,
  internal = `${ref(db)}.response.internal`;
const webhook = add("webhook", "n8n-nodes-base.webhook", 2.2, "Receber pedido UTM7", {
  httpMethod: "POST",
  path: "m7-utm7/vps/api",
  responseMode: "responseNode",
  authentication: "none",
  options: {
    allowedOrigins: "https://painel-m7.vercel.app,http://127.0.0.1:4177,http://localhost:4177",
  },
});
const normalize = code(
  "normalize",
  normal,
  `const incoming=$input.first().json;let p=incoming.body||{};if(typeof p==='string'){try{p=JSON.parse(p);}catch{p={};}}
if(!p||typeof p!=='object'||Array.isArray(p))p={};
const actions=['dashboard','save_offer','save_connection','sync_meta','prepare_budget','prepare_status'];
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const clean=Object.fromEntries(Object.entries(p).filter(([k])=>!['token','user_id','internal','authorized','is_admin','active'].includes(k)));
clean.action=actions.includes(p.action)?p.action:'invalid';clean.since=/^\\d{4}-\\d{2}-\\d{2}$/.test(p.since||'')?p.since:today;clean.until=/^\\d{4}-\\d{2}-\\d{2}$/.test(p.until||'')?p.until:today;
if(new Date(clean.until)-new Date(clean.since)>92*86400000||clean.since>clean.until)clean.action='invalid';
return [{json:{token:String(p.token||'').slice(0,12000),payload:clean}}];`,
);
const authenticate = add("authenticate", "n8n-nodes-base.httpRequest", 4.5, auth, {
  method:"POST",url:"http://utm7-gateway:8080/auth",authentication:"none",sendBody:true,specifyBody:"json",
  jsonBody:e(`{{ {action:"session",token:${ref(normal)}.token} }}`),
  options:{response:{response:{neverError:true,fullResponse:true,responseFormat:"json"}},timeout:12000}
});
const authGuard = readFileSync(path.join(root, "../src/lib/utm7-own-auth.mjs"), "utf8").replace(
  /^export /gm,
  "",
);
const identify = code(
  "identify",
  gate,
  authGuard +
    `\nreturn [{json:authorizeOwnUtm7(${ref(auth)},${ref(normal)}.payload)}];`,
);
const dispatch = sql(
  "dispatch",
  db,
  "SELECT utm7.authorize_and_dispatch($1::jsonb->>'user_id',($1::jsonb->>'authorized')::boolean,$1::jsonb->'payload') AS response;",
  "JSON.stringify($json)",
);
const choose = code(
  "choose",
  "Escolher operação autorizada",
  `const response=$input.first().json.response||{ok:false,status:503,error:'Armazenamento indisponível.'};const action=${request}.action;
const route=response.ok?(action==='dashboard'?0:action==='sync_meta'?1:action==='prepare_budget'?2:action==='prepare_status'?3:4):4;
return [{json:{route,response}}];`,
);
const route = add("route", "n8n-nodes-base.switch", 3.5, "Rotear operação", {
  mode: "expression",
  numberOutputs: 5,
  output: e("{{ $json.route }}"),
});
const respond = add("respond", "n8n-nodes-base.respondToWebhook", 1.5, "Responder UTM7", {
  respondWith: "json",
  responseBody: e("{{ $json.response }}"),
  options: {
    responseCode: e("{{ $json.response?.status || ($json.response?.ok ? 200 : 400) }}"),
    responseHeaders: {
      entries: [
        {
          name: "Access-Control-Allow-Origin",
          value: e(
            `{{ ['https://painel-m7.vercel.app','http://127.0.0.1:4177','http://localhost:4177'].includes($('Receber pedido UTM7').first().json.headers?.origin) ? $('Receber pedido UTM7').first().json.headers.origin : 'https://painel-m7.vercel.app' }}`,
          ),
        },
        { name: "Cache-Control", value: "no-store" },
        { name: "Content-Type", value: "application/json; charset=utf-8" },
      ],
    },
  },
});
const sheets = add(
  "sheets",
  "n8n-nodes-base.httpRequest",
  4.5,
  "Ler tracking e vendas",
  {
    method: "GET",
    url: "https://sheets.googleapis.com/v4/spreadsheets/1AlhIIhi8NXxImk5TB_GDLpRNvtpi96SpFN0lv8Cd8ww/values:batchGet?ranges=tracking!A1:T&ranges=vendas!A1:AI",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "googleSheetsOAuth2Api",
    options: {
      response: { response: { neverError: true, responseFormat: "json" } },
      timeout: 20000,
    },
  },
  {
    credentials: {
      googleSheetsOAuth2Api: { id: "HhlohcHbTvRJs3Si", name: "projetopessoal sheets" },
    },
  },
);
const engine = readFileSync(path.join(root, "../src/lib/utm7-engine.mjs"), "utf8").replace(
  /^export /gm,
  "",
);
const aggregate = code(
  "aggregate",
  "Calcular funil e atribuição",
  engine +
    `\nconst response=${ref(db)}.response;const sheet=$input.first().json;
if(sheet.error)return [{json:{response:{ok:false,status:502,error:'Não foi possível ler o Sheets. Verifique acesso e armazenamento da conta Google.'}}}];
return [{json:{response:{ok:true,data:buildDashboard(sheet,response.data,${request})}}}];`,
);

function metaGet(id, name, suffix, query, paginate = false) {
  const options = {
    response: { response: { neverError: true, responseFormat: "json" } },
    timeout: 20000,
  };
  if (paginate)
    options.pagination = {
      pagination: {
        paginationMode: "responseContainsNextURL",
        nextURL: e('{{ $response.body.paging?.next || "" }}'),
        paginationCompleteWhen: "other",
        completeExpression: e(
          "{{ !$response.body.paging?.next || Boolean($response.body.error) }}",
        ),
        limitPagesFetched: true,
        maxRequests: 30,
        requestInterval: 100,
      },
    };
  return add(
    id,
    "n8n-nodes-base.httpRequest",
    4.5,
    name,
    {
      method: "GET",
      url: e(`https://graph.facebook.com/v25.0/act_{{ ${internal}.account_id }}${suffix}`),
      authentication: "none",
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "Authorization", value: e(`Bearer {{ ${internal}.access_token }}`) }],
      },
      sendQuery: true,
      queryParameters: { parameters: query.map(([name, value]) => ({ name, value })) },
      options,
    },
    { executeOnce: true },
  );
}
const account = metaGet("account", "Consultar conta Meta", "", [
  ["fields", "id,name,account_id,currency,timezone_name"],
]);
const sets = metaGet(
  "sets",
  "Consultar conjuntos e anúncios",
  "/adsets",
  [
    [
      "fields",
      "id,name,daily_budget,lifetime_budget,status,effective_status,campaign{id,name,status,daily_budget},ads.limit(100){id,name,status,effective_status}",
    ],
    ["limit", "500"],
  ],
  true,
);
const baseFields =
  "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,date_stop,spend,impressions,inline_link_clicks,reach,frequency,actions,action_values,video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions";
const time = e(`{{ JSON.stringify({since:${request}.since,until:${request}.until}) }}`);
const day = metaGet(
  "day",
  "Consultar métricas por dia",
  "/insights",
  [
    ["fields", baseFields],
    ["level", "ad"],
    ["time_range", time],
    ["time_increment", "1"],
    ["limit", "500"],
  ],
  true,
);
const periodNodes = [];
for (const level of ["campaign", "adset", "ad"]) {
  const fields =
    level === "campaign"
      ? baseFields.replace("adset_id,adset_name,ad_id,ad_name,", "")
      : level === "adset"
        ? baseFields.replace("ad_id,ad_name,", "")
        : baseFields;
  periodNodes.push(
    metaGet(
      "period_" + level,
      "Consultar período " + level,
      "/insights",
      [
        ["fields", fields],
        ["level", level],
        ["time_range", time],
        ["limit", "500"],
      ],
      true,
    ),
  );
}
const pack = code(
  "pack",
  "Preparar cache Meta",
  `const collect=name=>$(name).all().map(x=>x.json);const batches={adsets:collect('Consultar conjuntos e anúncios'),daily:collect('Consultar métricas por dia'),campaign:collect('Consultar período campaign'),adset:collect('Consultar período adset'),ad:collect('Consultar período ad')};
let error='';for(const pages of Object.values(batches)){const failure=pages.find(x=>x.error);if(failure)error='Meta: '+String(failure.error.message||'Acesso recusado.').slice(0,300);if(pages.at(-1)?.paging?.next)error='Há mais páginas do que o limite desta sincronização. Reduza o período.';}
const account=$('Consultar conta Meta').first().json;if(account.error)error='Meta: '+String(account.error.message||'Conta indisponível.').slice(0,300);
const flat=key=>batches[key].flatMap(p=>p.data||[]);const adsets=flat('adsets');if(adsets.some(s=>s.ads?.paging?.next))error='Um conjunto ultrapassou 100 anúncios. A sincronização não foi salva para evitar dados incompletos.';
return [{json:{user_id:${ref(gate)}.user_id,connection_id:${request}.connection_id,since:${request}.since,until:${request}.until,payload:error?{error}:{account,adsets,daily:flat('daily'),period:{campaign:flat('campaign'),adset:flat('adset'),ad:flat('ad')}}}}];`,
);
const save = sql(
  "save",
  "Salvar cache Meta",
  "SELECT utm7.save_report($1::jsonb->>'user_id',($1::jsonb->>'connection_id')::uuid,($1::jsonb->>'since')::date,($1::jsonb->>'until')::date,$1::jsonb->'payload') AS response;",
  "JSON.stringify($json)",
);

const liveBudget = add(
  "liveBudget",
  "n8n-nodes-base.httpRequest",
  4.5,
  "Conferir orçamento atual na Meta",
  {
    method: "GET",
    url: e(
      `https://graph.facebook.com/v25.0/{{ ${request}.adset_id }}?fields=id,account_id,daily_budget,lifetime_budget,campaign{id,daily_budget,lifetime_budget}`,
    ),
    authentication: "none",
    sendHeaders: true,
    headerParameters: {
      parameters: [{ name: "Authorization", value: e(`Bearer {{ ${internal}.access_token }}`) }],
    },
    options: {
      response: { response: { neverError: true, responseFormat: "json" } },
      timeout: 12000,
    },
  },
);
const guard = readFileSync(path.join(root, "../src/lib/utm7-budget.mjs"), "utf8").replace(
  /^export /gm,
  "",
);
const checkBudget = code(
  "checkBudget",
  "Validar confirmação de orçamento",
  guard +
    `\nconst response=verifyBudget($input.first().json,${request},${internal});return [{json:{route:response.ok?0:1,response:response.ok?null:response}}];`,
);
const budgetRoute = add("budgetRoute", "n8n-nodes-base.switch", 3.5, "Orçamento confere?", {
  mode: "expression",
  numberOutputs: 2,
  output: e("{{ $json.route }}"),
});
const postBudget = add(
  "postBudget",
  "n8n-nodes-base.httpRequest",
  4.5,
  "Aplicar orçamento confirmado",
  {
    method: "POST",
    url: e(`https://graph.facebook.com/v25.0/{{ ${request}.adset_id }}`),
    authentication: "none",
    sendHeaders: true,
    headerParameters: {
      parameters: [{ name: "Authorization", value: e(`Bearer {{ ${internal}.access_token }}`) }],
    },
    sendBody: true,
    contentType: "form-urlencoded",
    bodyParameters: {
      parameters: [{ name: "daily_budget", value: e(`{{ String(${request}.new_budget_minor) }}`) }],
    },
    options: {
      response: { response: { neverError: true, responseFormat: "json" } },
      timeout: 15000,
    },
  },
);
const budgetResult = code(
  "budgetResult",
  "Preparar auditoria orçamento",
  `const result=$input.first().json;return [{json:{user_id:${ref(gate)}.user_id,request_id:${request}.request_id,success:result.success===true,status:result.response?.status||502,error:result.response?.error||(result.error?'Meta: '+String(result.error.message||'Orçamento recusado.').slice(0,300):'')}}];`,
);
const audit = sql(
  "audit",
  "Registrar resultado orçamento",
  "SELECT utm7.finish_budget($1::jsonb->>'user_id',($1::jsonb->>'request_id')::uuid,($1::jsonb->>'success')::boolean) AS response;",
  "JSON.stringify($json)",
);
const finishBudget = code(
  "finishBudget",
  "Retornar resultado orçamento",
  `const audit=$input.first().json.response,r=$('Preparar auditoria orçamento').first().json;return [{json:{response:r.success?audit:{ok:false,status:r.status||502,error:r.error||'Não foi possível confirmar a alteração. Consulte a Meta antes de repetir.'}}}];`,
);
const liveStatus = add(
  "liveStatus",
  "n8n-nodes-base.httpRequest",
  4.5,
  "Conferir veiculação atual na Meta",
  {
    method: "GET",
    url: e(`https://graph.facebook.com/v25.0/{{ ${request}.entity_id }}`),
    authentication: "none",
    sendQuery: true,
    queryParameters: {
      parameters: [
        {
          name: "fields",
          value: e(
            `{{ 'id,account_id,status,effective_status' + (${request}.level !== 'campaign' ? ',campaign{id,status}' : '') + (${request}.level === 'ad' ? ',adset{id,status}' : '') }}`,
          ),
        },
      ],
    },
    sendHeaders: true,
    headerParameters: {
      parameters: [{ name: "Authorization", value: e(`Bearer {{ ${internal}.access_token }}`) }],
    },
    options: {
      response: { response: { neverError: true, responseFormat: "json" } },
      timeout: 12000,
    },
  },
  { onError: "continueRegularOutput" },
);
const statusGuard = readFileSync(path.join(root, "../src/lib/utm7-status.mjs"), "utf8").replace(
  /^export /gm,
  "",
);
const checkStatus = code(
  "checkStatus",
  "Validar confirmação de veiculação",
  statusGuard +
    `\nconst response=verifyStatus($input.first().json,${request},${internal});return [{json:{route:response.ok?0:1,response:response.ok?null:response}}];`,
);
const statusRoute = add("statusRoute", "n8n-nodes-base.switch", 3.5, "Veiculação confere?", {
  mode: "expression",
  numberOutputs: 2,
  output: e("{{ $json.route }}"),
});
const postStatus = add(
  "postStatus",
  "n8n-nodes-base.httpRequest",
  4.5,
  "Aplicar veiculação confirmada",
  {
    method: "POST",
    url: e(`https://graph.facebook.com/v25.0/{{ ${request}.entity_id }}`),
    authentication: "none",
    sendHeaders: true,
    headerParameters: {
      parameters: [{ name: "Authorization", value: e(`Bearer {{ ${internal}.access_token }}`) }],
    },
    sendBody: true,
    contentType: "form-urlencoded",
    bodyParameters: {
      parameters: [{ name: "status", value: e(`{{ ${request}.desired_status }}`) }],
    },
    options: {
      response: { response: { neverError: true, responseFormat: "json" } },
      timeout: 15000,
    },
  },
  { onError: "continueRegularOutput" },
);
const statusResult = code(
  "statusResult",
  "Preparar auditoria veiculação",
  `const result=$input.first().json;return [{json:{user_id:${ref(gate)}.user_id,request_id:${request}.request_id,success:result.success===true,previous_status:$('Conferir veiculação atual na Meta').first().json.status||'',status:result.response?.status||502,error:result.response?.error||(result.error?'Meta: '+String(result.error.message||'Não foi possível confirmar a alteração.').slice(0,300):'Não foi possível confirmar a alteração. Sincronize antes de repetir.')}}];`,
);
const statusAudit = sql(
  "statusAudit",
  "Registrar resultado veiculação",
  "SELECT utm7.finish_status($1::jsonb->>'user_id',($1::jsonb->>'request_id')::uuid,($1::jsonb->>'success')::boolean,$1::jsonb->>'previous_status') AS response;",
  "JSON.stringify($json)",
);
const finishStatus = code(
  "finishStatus",
  "Retornar resultado veiculação",
  `const audit=$input.first().json.response,r=$('Preparar auditoria veiculação').first().json;return [{json:{response:r.success?audit:{ok:false,status:r.status||502,error:r.error}}}];`,
);

connect(webhook, normalize);
connect(normalize, authenticate);
connect(authenticate, identify);
connect(identify, dispatch);
connect(dispatch, choose);
connect(choose, route);
connect(route, sheets, 0);
connect(sheets, aggregate);
connect(aggregate, respond);
connect(route, account, 1);
connect(account, sets);
connect(sets, day);
connect(day, periodNodes[0]);
connect(periodNodes[0], periodNodes[1]);
connect(periodNodes[1], periodNodes[2]);
connect(periodNodes[2], pack);
connect(pack, save);
connect(save, respond);
connect(route, liveBudget, 2);
connect(liveBudget, checkBudget);
connect(checkBudget, budgetRoute);
connect(budgetRoute, postBudget, 0);
connect(budgetRoute, budgetResult, 1);
connect(postBudget, budgetResult);
connect(budgetResult, audit);
connect(audit, finishBudget);
connect(finishBudget, respond);
connect(route, liveStatus, 3);
connect(liveStatus, checkStatus);
connect(checkStatus, statusRoute);
connect(statusRoute, postStatus, 0);
connect(statusRoute, statusResult, 1);
connect(postStatus, statusResult);
connect(statusResult, statusAudit);
connect(statusAudit, finishStatus);
connect(finishStatus, respond);
connect(route, respond, 4);
const exprValue = (v) =>
  typeof v === "string" && v.startsWith("=")
    ? `expr(${JSON.stringify(v.slice(1))})`
    : Array.isArray(v)
      ? `[${v.map(exprValue).join(",")}]`
      : v && typeof v === "object"
        ? `{${Object.entries(v)
            .map(([k, x]) => JSON.stringify(k) + ":" + exprValue(x))
            .join(",")}}`
        : JSON.stringify(v);
let sdk = "import {workflow,node,trigger,expr} from '@n8n/workflow-sdk';\n";
const samples = {
  normalize: { token: "", payload: {} },
  authenticate: { statusCode: 401, body: {} },
  access: { statusCode: 401, body: [] },
  identify: { user_id: "", authorized: false, payload: {} },
  dispatch: { response: { ok: false, status: 403 } },
  choose: { route: 4, response: { ok: false, status: 403 } },
  route: { route: 4, response: { ok: false, status: 403 } },
  aggregate: { response: { ok: true, data: {} } },
  save: { response: { ok: true, data: {} } },
  checkBudget: { route: 1, response: { ok: false, status: 409 } },
  budgetRoute: { route: 1, response: { ok: false, status: 409 } },
  audit: { response: { ok: true, data: {} } },
  finishBudget: { response: { ok: true, data: {} } },
  checkStatus: { route: 1, response: { ok: false, status: 409 } },
  statusRoute: { route: 1, response: { ok: false, status: 409 } },
  statusAudit: { response: { ok: true, data: {} } },
  finishStatus: { response: { ok: true, data: {} } },
};
for (const n of nodes) {
  n.output = [samples[n.id] || {}];
  const { id, ...def } = n;
  sdk += `const ${id}=${id === "webhook" ? "trigger" : "node"}(${exprValue(def)});\n`;
}
sdk += "export default workflow('m7-utm7-api','UTM7 | API privada de atribuição').add(webhook)";
for (const l of links)
  sdk += `\n.add(${l.a}${l.output === undefined ? "" : `.output(${l.output})`}.to(${l.b}))`;
sdk +=
  "\n.group('Acesso privado',[normalize,authenticate,identify,dispatch,choose,route],{description:'Valida sessão própria na VPS antes de consultar dados, sem dependência do Supabase.'})";
sdk +=
  "\n.group('Sheets e atribuição',[sheets,aggregate],{description:'Lê tracking e vendas, elimina testes e duplicatas e calcula o funil por anúncio.'})";
sdk +=
  "\n.group('Sincronização Meta',[account,sets,day,period_campaign,period_adset,period_ad,pack,save],{description:'Consulta a Marketing API por nível e período e salva cache sem expor o token ao navegador.'})";
sdk +=
  "\n.group('Orçamento com confirmação',[liveBudget,checkBudget,budgetRoute,postBudget,budgetResult,audit,finishBudget],{description:'Confere conta, valor atual e confirmação; aplica orçamento e registra resultado sem mudar status.'})\n.group('Veiculação com confirmação',[liveStatus,checkStatus,statusRoute,postStatus,statusResult,statusAudit,finishStatus],{description:'Confere item, conta, estado atual e pais antes de ativar ou pausar, com auditoria privada.'});\n";
writeFileSync(path.join(root, "utm7-vps-api.workflow.js"), sdk);
writeFileSync(path.join(root, "../.workspace-utm7-nodes.json"), JSON.stringify(nodes));
console.log(`Generated ${nodes.length} nodes, ${sdk.length} bytes`);

