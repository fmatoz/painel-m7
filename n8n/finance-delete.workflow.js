import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const start = trigger({
  "type": "n8n-nodes-base.webhook",
  "version": 2.1,
  "config": {
    "name": "API POST Excluir",
    "parameters": {
      "httpMethod": "POST",
      "path": "m7-financeiro-excluir/m7-financeiro/excluir",
      "responseMode": "responseNode",
      "options": {}
    }
  }
});
const auth = node({
  "type": "n8n-nodes-base.code",
  "version": 2,
  "config": {
    "name": "Validar autorização e ID",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const expected = \"__M7_SERVER_TOKEN__\";\nconst request = $input.first().json;\nconst headers = request.headers || {};\nconst token = headers[\"x-m7-token\"] || headers[\"X-M7-Token\"];\nconst fail = (statusCode, error) => [{json:{allowed:false,ok:false,statusCode,error}}];\nif (!expected || expected === \"__M7_SERVER_TOKEN__\" || typeof token !== \"string\" || token !== expected) return fail(401,\"Não autorizado.\");\nconst body = request.body;\nif (!body || typeof body !== \"object\" || Array.isArray(body) || typeof body.id !== \"string\") return fail(400,\"Informe o ID do lançamento.\");\nconst id = body.id.trim();\nif (!id || id.length > 250 || /[\\x00-\\x1f\\x7f]/.test(id)) return fail(400,\"ID do lançamento inválido.\");\nreturn [{json:{allowed:true,id}}];"
    }
  }
});
const authorized = ifElse({
  "version": 2.3,
  "config": {
    "name": "Autorizado?",
    "parameters": {
      "conditions": {
        "options": {
          "caseSensitive": true,
          "leftValue": "",
          "typeValidation": "strict"
        },
        "conditions": [
          {
            "leftValue": expr("{{ $json.allowed }}"),
            "rightValue": true,
            "operator": {
              "type": "boolean",
              "operation": "equals"
            }
          }
        ],
        "combinator": "and"
      },
      "options": {}
    }
  }
});
const unique = ifElse({
  "version": 2.3,
  "config": {
    "name": "Linha única?",
    "parameters": {
      "conditions": {
        "options": {
          "caseSensitive": true,
          "leftValue": "",
          "typeValidation": "strict"
        },
        "conditions": [
          {
            "leftValue": expr("{{ $json.allowed }}"),
            "rightValue": true,
            "operator": {
              "type": "boolean",
              "operation": "equals"
            }
          }
        ],
        "combinator": "and"
      },
      "options": {}
    }
  }
});
const lookup = node({
  "type": "n8n-nodes-base.googleSheets",
  "version": 4.7,
  "config": {
    "name": "Buscar lançamento pelo ID",
    "parameters": {
      "resource": "sheet",
      "operation": "read",
      "authentication": "oAuth2",
      "documentId": {
        "__rl": true,
        "mode": "id",
        "value": "12gjHkWbtZxl6S3MsEq1rFw19T1WK0xqmCcFrBI5HmcE"
      },
      "sheetName": {
        "__rl": true,
        "mode": "list",
        "value": 2141180879,
        "cachedResultName": "Lancamentos"
      },
      "filtersUI": {
        "values": [
          {
            "lookupColumn": "id",
            "lookupValue": expr("{{ $json.id }}")
          }
        ]
      },
      "combineFilters": "AND",
      "options": {
        "returnAllMatches": "returnAllMatches",
        "dataLocationOnSheet": {
          "values": {
            "rangeDefinition": "specifyRangeA1",
            "range": "A:W"
          }
        }
      }
    },
    "credentials": {
      "googleSheetsOAuth2Api": {
        "id": "HhlohcHbTvRJs3Si",
        "name": "projetopessoal sheets"
      }
    },
    "onError": "continueRegularOutput",
    "alwaysOutputData": true
  }
});
const selectRow = node({
  "type": "n8n-nodes-base.code",
  "version": 2,
  "config": {
    "name": "Localizar linha exata",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const id = $(\"Validar autorização e ID\").first().json.id;\nconst all = $input.all().map(item=>item.json);\nconst fail = (statusCode,error)=>[{json:{allowed:false,ok:false,statusCode,error}}];\nif (all.some(row=>row.error)) return fail(502,\"Não foi possível consultar o lançamento.\");\nconst matches = all.filter(row=>String(row.id ?? \"\") === id);\nif (!matches.length) return fail(404,\"Lançamento não encontrado. Atualize a página.\");\nif (matches.length !== 1) return fail(409,\"ID duplicado na planilha. Exclusão bloqueada por segurança.\");\nconst rowNumber=Number(matches[0].row_number);\nif (!Number.isSafeInteger(rowNumber) || rowNumber < 2) return fail(409,\"Linha inválida. Exclusão bloqueada por segurança.\");\nreturn [{json:{allowed:true,id,rowNumber}}];"
    }
  }
});
const clearRow = node({
  "type": "n8n-nodes-base.googleSheets",
  "version": 4.7,
  "config": {
    "name": "Limpar somente lançamento selecionado",
    "parameters": {
      "resource": "sheet",
      "operation": "clear",
      "authentication": "oAuth2",
      "documentId": {
        "__rl": true,
        "mode": "id",
        "value": "12gjHkWbtZxl6S3MsEq1rFw19T1WK0xqmCcFrBI5HmcE"
      },
      "sheetName": {
        "__rl": true,
        "mode": "list",
        "value": 2141180879,
        "cachedResultName": "Lancamentos"
      },
      "clear": "specificRows",
      "startIndex": expr("{{ $json.rowNumber }}"),
      "rowsToDelete": 1
    },
    "credentials": {
      "googleSheetsOAuth2Api": {
        "id": "HhlohcHbTvRJs3Si",
        "name": "projetopessoal sheets"
      }
    },
    "onError": "continueRegularOutput",
    "alwaysOutputData": true
  }
});
const outcome = node({
  "type": "n8n-nodes-base.code",
  "version": 2,
  "config": {
    "name": "Confirmar resultado",
    "parameters": {
      "mode": "runOnceForAllItems",
      "language": "javaScript",
      "jsCode": "const result=$input.first().json;\nif(result.error) return [{json:{ok:false,statusCode:502,error:\"Não foi possível excluir o lançamento. Tente novamente.\"}}];\nreturn [{json:{ok:true,statusCode:200,id:$(\"Localizar linha exata\").first().json.id}}];"
    }
  }
});
const respond = node({
  "type": "n8n-nodes-base.respondToWebhook",
  "version": 1.5,
  "config": {
    "name": "Responder exclusão",
    "parameters": {
      "respondWith": "json",
      "responseBody": expr("{{ {ok:$json.ok, ...($json.ok ? {id:$json.id} : {error:$json.error})} }}"),
      "options": {
        "responseCode": expr("{{ $json.statusCode }}")
      }
    }
  }
});
export default workflow("m7-finance-delete", "M7 | API | Excluir lançamento").add(start).to(auth).to(authorized.onTrue(lookup.to(selectRow).to(unique.onTrue(clearRow.to(outcome).to(respond)).onFalse(respond))).onFalse(respond));

