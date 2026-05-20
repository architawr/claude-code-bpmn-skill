import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateModel } from '../scripts/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf-8');

test('a multi-plane file with per-plane-local coordinates is valid (no cross-plane overlap)', async () => {
  const r = await validateModel(fixture('subprocess-multiplane.bpmn'));
  assert.deepEqual(r.overlaps, [], 'shapes on different planes must not count as overlapping');
  assert.deepEqual(r.missing, [], 'every element (incl. drill-down children) has a shape');
  assert.equal(r.ok, true);
});

test('validate flags a flow element that has no shape', async () => {
  const r = await validateModel(fixture('added-node.bpmn')); // T_NEW / f_new lack DI
  assert.equal(r.ok, false);
  const missing = r.missing.join(' ');
  assert.match(missing, /T_NEW/, 'missing node reported');
  assert.match(missing, /f_new/, 'missing edge reported');
});

test('validate flags two overlapping shapes on the same plane', async () => {
  const r = await validateModel(fixture('overlap-di.bpmn'));
  assert.equal(r.ok, false);
  assert.equal(r.overlaps.length, 1, 'the one overlapping pair is reported');
});
