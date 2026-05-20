import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lintModel, summarizeText } from '../scripts/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf-8');

test('lint detects an AND-join after an XOR-split (deadlock)', async () => {
  const findings = await lintModel(fixture('deadlock.bpmn'));
  assert.equal(findings.length, 1);
  assert.match(findings[0], /DEADLOCK/);
});

test('lint passes a clean linear diagram', async () => {
  const findings = await lintModel(fixture('added-node.bpmn'));
  assert.deepEqual(findings, []);
});

test('summarize lists activities and sequence flows in plain text', async () => {
  const text = await summarizeText(fixture('subprocess-multiplane.bpmn'));
  assert.match(text, /Do thing/);
  assert.match(text, /Sub-process/);
  assert.match(text, /Pack/);
});
