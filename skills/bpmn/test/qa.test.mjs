import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { layoutModel, validateModel } from '../scripts/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf-8');
const evalFile = (name) => readFileSync(join(here, '../../../evals/files', name), 'utf-8');

test('generation is deterministic (same input -> identical output)', async () => {
  const a = await layoutModel(fixture('semantics-subprocess.bpmn'));
  const b = await layoutModel(fixture('semantics-subprocess.bpmn'));
  assert.equal(a, b);
});

test('resync is idempotent: laying out an already-laid file is stable', async () => {
  const once = await layoutModel(fixture('subprocess-multiplane.bpmn'));
  const twice = await layoutModel(once);
  assert.equal(twice, once, 'a second layout must not keep changing the diagram');
});

test('collaboration layout is stable on re-run', async () => {
  const once = await layoutModel(fixture('collab.bpmn'));
  const twice = await layoutModel(once);
  assert.equal(twice, once);
});

test('real exported fixtures parse and validate', async () => {
  for (const name of ['return.bpmn', 'order.bpmn', 'hiring.bpmn']) {
    const v = await validateModel(evalFile(name));
    assert.equal(v.ok, true, `${name}: ${JSON.stringify(v)}`);
  }
});
