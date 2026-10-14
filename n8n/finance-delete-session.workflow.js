import { workflow, node, trigger, ifElse, expr } from "@n8n/workflow-sdk";
const step0 = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.1,
  config: {
    name: "Excluir com sessão do painel",
    parameters: {
      httpMethod: "POST",
      path: "m7-finance/delete-session",
      authentication: "none",
      responseMode: "responseNode",
      options: { allowedOrigins: "https://painel-m7.vercel.app" },
    },
  },
  output: [{ json: { body: { id: "test", token: "session" } } }],
});
const step1 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Normalizar exclusão",
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "let body=$input.first().json.body;\nif(typeof body==='string'){try{body=JSON.parse(body);}catch{body={};}}\nif(!body || typeof body!=='object' || Array.isArray(body)) body={};\nreturn [{json:{token:typeof body.token==='string' ? body.token : '',id:typeof body.id==='string' ? body.id.trim() : ''}}];",
    },
  },
  output: [{ json: { token: "session", id: "test" } }],
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
        timeout: 10000,
      },
    },
    onError: "continueRegularOutput",
  },
  output: [{ json: { statusCode: 200, body: { id: "user" } } }],
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
          { name: "select", value: "user_id,active,can_financeiro" },
          {
            name: "user_id",
            value: expr(
              "{{ 'eq.' + ($json.statusCode === 200 && $json.body?.id ? $json.body.id : '00000000-0000-0000-0000-000000000000') }}",
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
            value: expr("Bearer {{ $('Normalizar exclusão').first().json.token }}"),
          },
        ],
      },
      options: {
        response: { response: { neverError: true, responseFormat: "json", fullResponse: true } },
        timeout: 10000,
      },
    },
    onError: "continueRegularOutput",
  },
  output: [
    { json: { statusCode: 200, body: [{ user_id: "user", active: true, can_financeiro: true }] } },
  ],
});
const step4 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Validar autorização e ID",
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const request=$('Normalizar exclusão').first().json;\nconst auth=$('Validar sessão no Supabase').first().json;\nconst access=$input.first().json;\nconst fail=(statusCode,error)=>[{json:{allowed:false,ok:false,statusCode,error}}];\nif(auth.statusCode!==200 || !auth.body?.id) return fail(401,'Sua sessão expirou. Entre novamente.');\nconst profile=access.statusCode===200 && Array.isArray(access.body) ? access.body.find(row=>row.user_id===auth.body.id) : null;\nif(!profile || profile.active!==true || profile.can_financeiro!==true) return fail(403,'Você não tem acesso ao Financeiro.');\nconst id=request.id;\nif(!id || id.length>250 || /[\\x00-\\x1f\\x7f]/.test(id)) return fail(400,'ID do lançamento inválido.');\nreturn [{json:{allowed:true,id}}];",
    },
  },
  output: [{ json: { allowed: true, id: "test", ok: false, statusCode: 403 } }],
});
const step5 = ifElse({
  version: 2.3,
  config: {
    name: "Autorizado?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [
          {
            leftValue: expr("{{ $json.allowed }}"),
            rightValue: true,
            operator: { type: "boolean", operation: "equals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
  },
  output: [{ json: { allowed: true, id: "test" } }],
});
const step6 = node({
  type: "n8n-nodes-base.googleSheets",
  version: 4.7,
  config: {
    name: "Buscar lançamento pelo ID",
    parameters: {
      resource: "sheet",
      operation: "read",
      authentication: "oAuth2",
      documentId: { __rl: true, mode: "id", value: "12gjHkWbtZxl6S3MsEq1rFw19T1WK0xqmCcFrBI5HmcE" },
      sheetName: { __rl: true, mode: "list", value: 2141180879, cachedResultName: "Lancamentos" },
      filtersUI: { values: [{ lookupColumn: "id", lookupValue: expr("{{ $json.id }}") }] },
      combineFilters: "AND",
      options: {
        returnAllMatches: "returnAllMatches",
        dataLocationOnSheet: { values: { rangeDefinition: "specifyRangeA1", range: "A:W" } },
      },
    },
    credentials: {
      googleSheetsOAuth2Api: { id: "HhlohcHbTvRJs3Si", name: "projetopessoal sheets" },
    },
    onError: "continueRegularOutput",
    alwaysOutputData: true,
  },
  output: [{ json: { id: "test", row_number: 2 } }],
});
const step7 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Localizar linha exata",
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        'const id = $("Validar autorização e ID").first().json.id;\nconst all = $input.all().map(item=>item.json);\nconst fail = (statusCode,error)=>[{json:{allowed:false,ok:false,statusCode,error}}];\nif (all.some(row=>row.error)) return fail(502,"Não foi possível consultar o lançamento.");\nconst matches = all.filter(row=>String(row.id ?? "") === id);\nif (!matches.length) return fail(404,"Lançamento não encontrado. Atualize a página.");\nif (matches.length !== 1) return fail(409,"ID duplicado na planilha. Exclusão bloqueada por segurança.");\nconst rowNumber=Number(matches[0].row_number);\nif (!Number.isSafeInteger(rowNumber) || rowNumber < 2) return fail(409,"Linha inválida. Exclusão bloqueada por segurança.");\nreturn [{json:{allowed:true,id,rowNumber}}];',
    },
  },
  output: [{ json: { allowed: true, id: "test", rowNumber: 2, ok: false, statusCode: 409 } }],
});
const step8 = ifElse({
  version: 2.3,
  config: {
    name: "Linha única?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [
          {
            leftValue: expr("{{ $json.allowed }}"),
            rightValue: true,
            operator: { type: "boolean", operation: "equals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
  },
  output: [{ json: { allowed: true, id: "test", rowNumber: 2 } }],
});
const step9 = node({
  type: "n8n-nodes-base.googleSheets",
  version: 4.7,
  config: {
    name: "Limpar somente lançamento selecionado",
    parameters: {
      resource: "sheet",
      operation: "clear",
      authentication: "oAuth2",
      documentId: { __rl: true, mode: "id", value: "12gjHkWbtZxl6S3MsEq1rFw19T1WK0xqmCcFrBI5HmcE" },
      sheetName: { __rl: true, mode: "list", value: 2141180879, cachedResultName: "Lancamentos" },
      clear: "specificRows",
      startIndex: expr("{{ $json.rowNumber }}"),
      rowsToDelete: 1,
    },
    credentials: {
      googleSheetsOAuth2Api: { id: "HhlohcHbTvRJs3Si", name: "projetopessoal sheets" },
    },
    onError: "continueRegularOutput",
    alwaysOutputData: true,
  },
  output: [{ json: { success: true } }],
});
const step10 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Confirmar resultado",
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        'const result=$input.first().json;\nif(result.error) return [{json:{ok:false,statusCode:502,error:"Não foi possível excluir o lançamento. Tente novamente."}}];\nreturn [{json:{ok:true,statusCode:200,id:$("Localizar linha exata").first().json.id}}];',
    },
  },
  output: [{ json: { ok: true, statusCode: 200, id: "test" } }],
});
const step11 = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    name: "Responder exclusão",
    parameters: {
      respondWith: "json",
      responseBody: expr(
        "{{ {ok:$json.ok, ...($json.ok ? {id:$json.id} : {error:$json.error})} }}",
      ),
      options: {
        responseCode: expr("{{ $json.statusCode }}"),
        responseHeaders: {
          entries: [
            { name: "Access-Control-Allow-Origin", value: "https://painel-m7.vercel.app" },
            { name: "Cache-Control", value: "no-store" },
          ],
        },
      },
    },
  },
  output: [{ json: { ok: true, id: "test" } }],
});
export default workflow("m7-finance-delete-session", "M7 | Financeiro | Exclusão autenticada")
  .add(step0)
  .to(step1)
  .to(step2)
  .to(step3)
  .to(step4)
  .to(
    step5
      .onTrue(step6.to(step7).to(step8.onTrue(step9.to(step10).to(step11)).onFalse(step11)))
      .onFalse(step11),
  );
