import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { layoutModel } from '../scripts/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf-8');

test('resync output is pretty-printed (indented) for clean diffs', async () => {
  const out = await layoutModel(fixture('added-node.bpmn')); // has DI -> resync -> moddle.toXML
  assert.match(out, /\n {2}<bpmn:process/, 'process indented at 2 spaces');
  assert.match(out, /\n {4}<bpmn:/, 'flow elements indented under the process');
});

test('collaboration output is pretty-printed', async () => {
  const out = await layoutModel(fixture('collab.bpmn')); // generate (collaboration assembly)
  assert.match(out, /\n {2}<bpmn:/, 'top-level elements indented');
});
