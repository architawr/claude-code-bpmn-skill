#!/usr/bin/env node
/**
 * check-fixtures.mjs - deterministic pre-grader for the eval fixtures.
 *
 * The behavioural cases in evals.json are LLM-graded, but their *inputs* must be
 * correct for the grading to mean anything: a "review the deadlock" case is only
 * valid if the fixture actually deadlocks. This script asserts those input
 * invariants with the skill's own tools, so a broken fixture is caught without
 * spending an LLM run.
 *
 * Run from the repo root:  node evals/check-fixtures.mjs
 * (Requires `npm install` in skills/bpmn/ so the tools' deps are present.)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lintModel, validateModel, diffModels, findModel } from '../skills/bpmn/scripts/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, 'files', name), 'utf-8');

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};
const lintHas = (findings, re) => findings.some((f) => re.test(f));

async function main() {
  // review fixtures must exhibit the bug they're meant to teach
  const deadlock = await lintModel(read('approval-buggy.bpmn'));
  check('approval-buggy lints as a deadlock', lintHas(deadlock, /DEADLOCK/));

  const messy = await lintModel(read('messy.bpmn'));
  check('messy lints UNREACHABLE', lintHas(messy, /UNREACHABLE/));
  check('messy lints DEAD END', lintHas(messy, /DEAD END/));
  check('messy lints IMPLICIT SPLIT', lintHas(messy, /IMPLICIT SPLIT/));

  const cb = await lintModel(read('collab-buggy.bpmn'));
  check('collab-buggy lints INTERNAL MESSAGE FLOW', lintHas(cb, /INTERNAL MESSAGE FLOW/));
  check('collab-buggy lints BAD BOUNDARY', lintHas(cb, /BAD BOUNDARY/));

  // validate-fix fixture must actually be broken
  const broken = await validateModel(read('broken-di.bpmn'));
  check('broken-di fails validation (overlap)', broken.ok === false && broken.overlaps.length > 0);

  // diff pair must produce the expected delta
  const d = await diffModels(read('process-v1.bpmn'), read('process-v2.bpmn'));
  check('diff: Charge card added', d.added.some((e) => e.id === 'Tcharge'));
  check('diff: Gift wrap removed', d.removed.some((e) => e.id === 'Tgift'));
  check('diff: Ship renamed', d.renamed.some((r) => r.id === 'Tship'));
  check('diff: flow f2 rewired', d.rewired.some((r) => r.id === 'f2'));

  // find fixture must contain the locatable step and be clean
  const hits = await findModel(read('big-process.bpmn'), 'verify');
  check('find: Verify identity locatable', hits.some((h) => h.id === 'Verify'));
  check('big-process lints clean', (await lintModel(read('big-process.bpmn'))).length === 0);

  // baseline fixtures must validate
  for (const name of ['return.bpmn', 'order.bpmn', 'hiring.bpmn']) {
    check(`${name} validates`, (await validateModel(read(name))).ok === true);
  }

  console.log(failures ? `\n${failures} FAILED` : '\nAll fixture invariants hold.');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
