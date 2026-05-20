import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { diffModels, findModel } from '../scripts/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf-8');

test('diff reports added, renamed, and rewired between two versions', async () => {
  const d = await diffModels(fixture('clean-linear.bpmn'), fixture('clean-linear-v2.bpmn'));
  assert.ok(d.added.some((e) => e.id === 'T2'), 'T2 added');
  assert.ok(d.renamed.some((r) => r.id === 'T1' && r.from === 'Work' && r.to === 'Review'), 'T1 renamed');
  assert.ok(d.rewired.some((r) => r.id === 'f2'), 'f2 rewired (target changed)');
  assert.equal(d.removed.length, 0, 'nothing removed');
});

test('diff of a file with itself is empty', async () => {
  const d = await diffModels(fixture('clean-linear.bpmn'), fixture('clean-linear.bpmn'));
  assert.deepEqual([d.added, d.removed, d.renamed, d.retyped, d.rewired], [[], [], [], [], []]);
});

test('find matches elements by name substring (case-insensitive)', async () => {
  const hits = await findModel(fixture('clean-linear.bpmn'), 'work');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'T1');
});

test('find matches elements by type', async () => {
  const hits = await findModel(fixture('clean-linear-v2.bpmn'), 'task');
  assert.deepEqual(hits.map((h) => h.id).sort(), ['T1', 'T2']);
});
