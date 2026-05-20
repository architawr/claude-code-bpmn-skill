import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { layoutModel, parseBpmn, validateModel } from '../scripts/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf-8');

const mainPlane = (defs) => (defs.diagrams || [])[0].plane;
const elemIds = (plane) => (plane.planeElement || []).map((pe) => pe.bpmnElement && pe.bpmnElement.id);

test('resync prunes shapes/edges whose element was deleted from semantics', async () => {
  const out = await layoutModel(fixture('stale-di.bpmn')); // default = resync
  const { defs, warnings } = await parseBpmn(out);
  const ids = elemIds(mainPlane(defs));
  assert.ok(ids.includes('S1') && ids.includes('T1') && ids.includes('E1'), 'real elements kept');
  assert.ok(!ids.includes(undefined), 'no dangling shapes/edges remain after resync');
  assert.equal(warnings.length, 0, 'resynced file has no unresolved-reference warnings');
});

const shapeOf = (plane, id) =>
  (plane.planeElement || []).find((pe) => pe.bpmnElement && pe.bpmnElement.id === id && pe.bounds);
const edgeOf = (plane, id) =>
  (plane.planeElement || []).find((pe) => pe.bpmnElement && pe.bpmnElement.id === id && pe.waypoint);

test('resync places a shape and edge for a newly added node', async () => {
  const out = await layoutModel(fixture('added-node.bpmn')); // default = resync
  const { defs } = await parseBpmn(out);
  const plane = mainPlane(defs);

  const shape = shapeOf(plane, 'T_NEW');
  assert.ok(shape, 'new node T_NEW got a BPMNShape');
  assert.ok(shape.bounds.width > 0 && shape.bounds.height > 0, 'shape has real bounds');

  const edge = edgeOf(plane, 'f_new');
  assert.ok(edge, 'new flow f_new got a BPMNEdge');
  assert.ok((edge.waypoint || []).length >= 2, 'edge has at least two waypoints');

  // existing geometry untouched
  assert.equal(shapeOf(plane, 'T1').bounds.x, 175, 'existing T1 position preserved');
});

test('resynced diagram with an added node validates clean (no overlap, nothing missing)', async () => {
  const out = await layoutModel(fixture('added-node.bpmn'));
  const v = await validateModel(out);
  assert.deepEqual(v.missing, [], 'no missing shapes');
  assert.deepEqual(v.overlaps, [], 'auto-placement did not overlap an existing shape');
  assert.equal(v.ok, true);
});
