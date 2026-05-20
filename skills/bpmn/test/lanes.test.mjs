import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { layoutModel, parseBpmn, validateModel } from '../scripts/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf-8');

const mainPlane = (defs) => (defs.diagrams || [])[0].plane;
const shape = (plane, id) => (plane.planeElement || []).find((pe) => pe.bpmnElement && pe.bpmnElement.id === id && pe.bounds);

test('layout of a process with lanes draws lane shapes', async () => {
  const out = await layoutModel(fixture('lanes.bpmn')); // no DI -> generate
  const { defs } = await parseBpmn(out);
  const plane = mainPlane(defs);
  assert.ok(shape(plane, 'L1'), 'lane L1 has a shape');
  assert.ok(shape(plane, 'L2'), 'lane L2 has a shape');
});

test('nodes are placed inside their own lane band', async () => {
  const out = await layoutModel(fixture('lanes.bpmn'));
  const { defs } = await parseBpmn(out);
  const plane = mainPlane(defs);
  const t1 = shape(plane, 'T1').bounds; // lane L1
  const t2 = shape(plane, 'T2').bounds; // lane L2
  const l1 = shape(plane, 'L1').bounds;
  const l2 = shape(plane, 'L2').bounds;
  // each node sits within its lane's vertical band
  assert.ok(t1.y >= l1.y && t1.y + t1.height <= l1.y + l1.height, 'T1 inside Sales lane');
  assert.ok(t2.y >= l2.y && t2.y + t2.height <= l2.y + l2.height, 'T2 inside Warehouse lane');
  assert.ok(l2.y >= l1.y + l1.height - 1, 'lanes stacked, not overlapping');
});

test('a laid-out laned process validates clean', async () => {
  const out = await layoutModel(fixture('lanes.bpmn'));
  const v = await validateModel(out);
  assert.equal(v.ok, true, JSON.stringify(v));
});
