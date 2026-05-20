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
const edge = (plane, id) => (plane.planeElement || []).find((pe) => pe.bpmnElement && pe.bpmnElement.id === id && pe.waypoint);

test('layout places shapes for data objects and text annotations', async () => {
  const out = await layoutModel(fixture('data-artifacts.bpmn'));
  const { defs } = await parseBpmn(out);
  const plane = mainPlane(defs);
  assert.ok(shape(plane, 'DOR1'), 'data object reference has a shape');
  assert.ok(shape(plane, 'TA1'), 'text annotation has a shape');
});

test('layout draws association and data-association edges', async () => {
  const out = await layoutModel(fixture('data-artifacts.bpmn'));
  const { defs } = await parseBpmn(out);
  const plane = mainPlane(defs);
  assert.ok(edge(plane, 'as1'), 'association edge present');
  assert.ok(edge(plane, 'doa1'), 'data output association edge present');
});

test('a diagram with data objects and annotations validates clean', async () => {
  const v = await validateModel(await layoutModel(fixture('data-artifacts.bpmn')));
  assert.equal(v.ok, true, JSON.stringify(v));
});
