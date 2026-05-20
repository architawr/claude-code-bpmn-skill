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

test('a node inserted between two placed nodes sits on the flow line, shifting downstream right', async () => {
  const out = await layoutModel(fixture('insert-between.bpmn')); // N inserted T1 -> N -> E
  const { defs } = await parseBpmn(out);
  const plane = mainPlane(defs);
  const t1 = shapeOf(plane, 'T1').bounds;
  const n = shapeOf(plane, 'N').bounds;
  const e = shapeOf(plane, 'E').bounds;
  assert.ok(Math.abs((n.y + n.height / 2) - (t1.y + t1.height / 2)) < 2, 'N is vertically aligned with T1 (on the line)');
  assert.ok(n.x > t1.x && n.x < e.x, 'N sits between T1 and E horizontally');
  assert.ok(e.x > 507, 'downstream E was shifted right to make room');
  const v = await validateModel(out);
  assert.equal(v.ok, true, JSON.stringify(v));
});

test('a newly added boundary event is placed on its host edge', async () => {
  const out = await layoutModel(fixture('add-boundary.bpmn')); // Timer attached to T1
  const { defs } = await parseBpmn(out);
  const plane = mainPlane(defs);
  const t1 = shapeOf(plane, 'T1').bounds;
  const timer = shapeOf(plane, 'Timer').bounds;
  const hostBottom = t1.y + t1.height;
  assert.ok(timer.y < hostBottom && timer.y + timer.height > hostBottom, 'Timer straddles T1 bottom edge');
  const v = await validateModel(out);
  assert.equal(v.ok, true, JSON.stringify(v));
});

test('resync re-routes an edge whose waypoints no longer touch its endpoints', async () => {
  const out = await layoutModel(fixture('stale-edge.bpmn')); // f2_di has bogus waypoints
  const { defs } = await parseBpmn(out);
  const plane = mainPlane(defs);
  const f2 = (plane.planeElement || []).find((pe) => pe.bpmnElement && pe.bpmnElement.id === 'f2' && pe.waypoint);
  const wp = f2.waypoint;
  const first = wp[0];
  const last = wp[wp.length - 1];
  // first waypoint should leave T1 (x ~ 275), last should reach E (x ~ 507)
  assert.ok(first.x >= 175 && first.x <= 285, `re-routed start near T1, got x=${first.x}`);
  assert.ok(last.x >= 500 && last.x <= 545, `re-routed end near E, got x=${last.x}`);
  // a still-correct edge (f1) is left untouched
  const f1 = (plane.planeElement || []).find((pe) => pe.bpmnElement && pe.bpmnElement.id === 'f1' && pe.waypoint);
  assert.equal(f1.waypoint[0].x, 93, 'correct edge f1 keeps its waypoints');
});

test('resynced diagram with an added node validates clean (no overlap, nothing missing)', async () => {
  const out = await layoutModel(fixture('added-node.bpmn'));
  const v = await validateModel(out);
  assert.deepEqual(v.missing, [], 'no missing shapes');
  assert.deepEqual(v.overlaps, [], 'auto-placement did not overlap an existing shape');
  assert.equal(v.ok, true);
});
