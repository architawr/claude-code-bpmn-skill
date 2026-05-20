import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { layoutModel, parseBpmn, validateModel } from '../scripts/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf-8');

const collabPlane = (defs) =>
  (defs.diagrams || []).find((d) => d.plane && d.plane.bpmnElement && d.plane.bpmnElement.id === 'C1').plane;
const ids = (plane) => (plane.planeElement || []).map((pe) => pe.bpmnElement && pe.bpmnElement.id);
const shape = (plane, id) => (plane.planeElement || []).find((pe) => pe.bpmnElement && pe.bpmnElement.id === id && pe.bounds);

test('layout of a collaboration lays out every pool, both processes, and the message flow', async () => {
  const out = await layoutModel(fixture('collab.bpmn')); // no DI -> generate
  const { defs } = await parseBpmn(out);
  const plane = collabPlane(defs);
  const present = ids(plane);

  assert.ok(present.includes('Pa') && present.includes('Pb'), 'both pools have shapes');
  assert.ok(present.includes('T_order'), 'first pool node laid out');
  assert.ok(present.includes('T_fill'), 'second pool node laid out (not skipped)');
  assert.ok(present.includes('mf1'), 'message flow has an edge');
});

test('collaboration pools do not overlap each other', async () => {
  const out = await layoutModel(fixture('collab.bpmn'));
  const { defs } = await parseBpmn(out);
  const plane = collabPlane(defs);
  const a = shape(plane, 'Pa').bounds;
  const b = shape(plane, 'Pb').bounds;
  const disjoint = a.y + a.height <= b.y || b.y + b.height <= a.y;
  assert.ok(disjoint, 'the two pools occupy separate vertical bands');
});

test('a laid-out collaboration validates clean', async () => {
  const out = await layoutModel(fixture('collab.bpmn'));
  const v = await validateModel(out);
  assert.equal(v.ok, true, JSON.stringify(v));
});
