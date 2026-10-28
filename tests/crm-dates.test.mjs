import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

process.env.TZ = 'America/Sao_Paulo';
const source = ts.transpileModule(readFileSync(new URL('../src/lib/crm-dates.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {localDate, localDateTime, nextActionInDays} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('Hoje uses the local calendar even when UTC is already tomorrow', () => {
  assert.equal(localDate(new Date('2026-10-29T01:30:00Z')), '2026-10-28');
});

test('next-action shortcuts cross month boundaries and preserve local time', () => {
  const now = new Date('2026-10-28T21:30:42Z');
  for (const [days, expected] of [[3,'2026-10-31T18:30'],[7,'2026-11-04T18:30'],[14,'2026-11-11T18:30']]) {
    assert.equal(localDateTime(nextActionInDays(days, now)), expected);
  }
  assert.equal(localDateTime(nextActionInDays(7, new Date('2026-12-28T21:30:00Z'))), '2027-01-04T18:30');
});

test('manual datetime survives save/reopen without timezone drift', () => {
  const manual = '2026-11-04T09:45';
  assert.equal(localDateTime(new Date(manual).toISOString()), manual);
  for (const value of [null, undefined, '', 'invalid']) assert.equal(localDateTime(value), '');
});
