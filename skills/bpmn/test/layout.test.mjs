import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { layoutModel, parseBpmn, validateModel } from '../scripts/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf-8');

const planeFor = (defs, id) =>
  (defs.diagrams || []).find((d) => d.plane && d.plane.bpmnElement && d.plane.bpmnElement.id === id);
const shapeIds = (plane) =>
  (plane.plane.planeElement || []).map((pe) => pe.bpmnElement && pe.bpmnElement.id);

test('default layout preserves a sub-process drill-down plane', async () => {
  const out = await layoutModel(fixture('subprocess-multiplane.bpmn')); // default = resync
  const { defs } = await parseBpmn(out);
  const sp = planeFor(defs, 'SP1');
  assert.ok(sp, 'SP1 drill-down plane should still exist');
  const ids = shapeIds(sp);
  assert.ok(ids.includes('S2'), 'inner start S2 keeps its shape');
  assert.ok(ids.includes('T2'), 'inner task T2 keeps its shape');
  assert.ok(ids.includes('E2'), 'inner end E2 keeps its shape');
});

test('layout from semantics-only generates a valid multi-plane diagram (sub-process not collapsed)', async () => {
  const out = await layoutModel(fixture('semantics-subprocess.bpmn')); // no DI -> generate
  const v = await validateModel(out);
  assert.equal(v.ok, true, JSON.stringify(v));
  const { defs } = await parseBpmn(out);
  const sp = planeFor(defs, 'SP1');
  assert.ok(sp, 'a drill-down plane for SP1 is generated');
  assert.ok(shapeIds(sp).includes('T2'), 'inner node laid out on the drill-down plane');
});

test('--rebuild regenerates from scratch and stays valid', async () => {
  const out = await layoutModel(fixture('subprocess-multiplane.bpmn'), { rebuild: true });
  const v = await validateModel(out);
  assert.equal(v.ok, true, JSON.stringify(v));
});
