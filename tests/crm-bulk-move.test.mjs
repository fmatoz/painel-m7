import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/lib/crm-bulk-move.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {moveLeadBatch} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('bulk move deduplicates IDs, limits concurrency, and isolates failures for retry', async () => {
  let active = 0;
  let peak = 0;
  const called = [];
  const result = await moveLeadBatch(['a','b','c','a','d','e'], async (id) => {
    called.push(id);
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    if (id === 'b') throw new Error('permission or network failure');
  });
  assert.equal(peak, 3);
  assert.equal(called.length, 5);
  assert.deepEqual(result.succeeded.sort(), ['a','c','d','e']);
  assert.deepEqual(result.failed, ['b']);
  const retried = [];
  await moveLeadBatch(result.failed, async (id) => retried.push(id));
  assert.deepEqual(retried, ['b']);
});

test('empty selection makes no requests and total failure never reports success', async () => {
  assert.deepEqual(await moveLeadBatch([], () => { throw new Error('must not call'); }), {succeeded:[],failed:[]});
  const result = await moveLeadBatch(['a','b'], async () => { throw new Error('offline'); });
  assert.deepEqual(result.succeeded, []);
  assert.deepEqual(result.failed.sort(), ['a','b']);
});
