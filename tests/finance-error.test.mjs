import test from "node:test";
import assert from "node:assert/strict";
import { financialFunctionError } from "../src/lib/finance-error.ts";

test("reveals nested n8n error and preserves response body", async () => {
  const context = new Response(JSON.stringify({ error: "n8n error", message: JSON.stringify({error:"Lançamento não encontrado."}) }), {status:404});
  const result = await financialFunctionError({context});
  assert.equal(result.message, "HTTP 404: Lançamento não encontrado.");
  assert.equal(context.bodyUsed, false);
});
test("reveals Edge Function invalid-action and auth failures", async () => {
  for (const [status,error] of [[400,"Invalid action"],[401,"Unauthorized"],[403,"Forbidden: Access not granted"]]) {
    const result = await financialFunctionError({context:new Response(JSON.stringify({error}),{status})});
    assert.equal(result.message, `HTTP ${status}: ${error}`);
  }
});
test("does not expose HTML error pages", async () => {
  const result = await financialFunctionError({context:new Response("<html>upstream</html>",{status:502})});
  assert.match(result.message, /HTTP 502/);
  assert.doesNotMatch(result.message, /html/);
});
test("preserves network errors", async () => {
  const error = new Error("Network error");
  assert.equal(await financialFunctionError(error), error);
});
