import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const filter = JSON.parse(readFileSync(new URL('../n8n/crm-sync-request-filter.json', import.meta.url), 'utf8'));
const condition = filter.parameters.conditions.conditions[0];
const expression = condition.leftValue.slice(3, -2).trim();
const accepts = (json) => vm.runInNewContext(expression, { $json: json }) === condition.rightValue;

test('empty queue and Postgres success placeholders cannot import leads', () => {
  for (const item of [{}, {success:true}, {command_id:null}, {command_id:''}, {command_id:123}, {command_id:'undefined'}, {command_id:'not-a-command'}]) {
    assert.equal(accepts(item), false);
  }
});

test('a real queued command ID can continue to the existing importer', () => {
  assert.equal(accepts({command_id:'a8706b11-aee2-435c-9c9c-dc1f955e0c48'}), true);
  assert.equal(filter.type, 'n8n-nodes-base.filter');
  assert.deepEqual(condition.operator, {type:'boolean',operation:'equals'});
});
