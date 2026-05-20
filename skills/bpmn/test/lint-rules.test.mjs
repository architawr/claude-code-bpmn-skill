import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lintModel } from '../scripts/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf-8');
const has = (findings, re) => findings.some((f) => re.test(f));

test('lint flags an implicit split (non-gateway node with >1 outgoing flow)', async () => {
  const f = await lintModel(fixture('implicit-split.bpmn'));
  assert.ok(has(f, /IMPLICIT SPLIT/), 'implicit split reported');
  assert.ok(has(f, /IMPLICIT SPLIT.*Work/), 'names the offending task');
});

test('lint flags a start event with an incoming flow and an end event with an outgoing flow', async () => {
  const f = await lintModel(fixture('bad-events.bpmn'));
  assert.ok(has(f, /start event .*incoming/), 'start-with-incoming reported');
  assert.ok(has(f, /end event .*outgoing/), 'end-with-outgoing reported');
});

test('lint flags a boundary event attached to a non-activity', async () => {
  const f = await lintModel(fixture('bad-boundary.bpmn'));
  assert.ok(has(f, /BAD BOUNDARY/), 'bad boundary host reported');
});

test('lint flags a flow node not assigned to any lane', async () => {
  const f = await lintModel(fixture('lane-gap.bpmn'));
  assert.ok(has(f, /UNASSIGNED NODE/), 'unassigned node reported');
  assert.ok(has(f, /Unassigned end/), 'names the unassigned node');
});

test('lint flags a message flow that stays within one pool', async () => {
  const f = await lintModel(fixture('internal-msgflow.bpmn'));
  assert.ok(has(f, /INTERNAL MESSAGE FLOW/), 'internal message flow reported');
});

test('clean diagram still produces no findings with the new rules', async () => {
  assert.deepEqual(await lintModel(fixture('clean-linear.bpmn')), []);
});
