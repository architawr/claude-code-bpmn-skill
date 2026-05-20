#!/usr/bin/env node
/**
 * bpmn-tool.mjs - CLI for the `bpmn` skill. Thin wrapper around lib.mjs, which
 * holds all the mechanics (so they can be tested directly).
 *
 *   summarize <file.bpmn> [--json]     Structured outline of a process
 *   layout    <in.bpmn> [out] [--rebuild]
 *                                      Safe layout: keep & re-sync existing DI,
 *                                      or generate from scratch if there's none.
 *                                      --rebuild forces a full regeneration.
 *   validate  <file.bpmn>              Parse; flag missing shapes, overlaps, warnings
 *   lint      <file.bpmn>              Find control-flow bugs
 *
 * Run `npm install` once in the skill root before using.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  summarizeText, summarizeJson, layoutModel, validateModel, lintModel,
  diffModels, findModel,
} from './lib.mjs';

async function summarize(path, asJson) {
  const xml = readFileSync(path, 'utf-8');
  if (asJson) console.log(JSON.stringify(await summarizeJson(xml), null, 2));
  else console.log(await summarizeText(xml));
}

async function layout(inPath, outPath, rebuild) {
  const xml = readFileSync(inPath, 'utf-8');
  const hadDI = /<bpmndi:/.test(xml);
  const out = await layoutModel(xml, { rebuild });
  const dest = outPath || inPath;
  writeFileSync(dest, out, 'utf-8');
  const mode = rebuild || !hadDI ? 'generated from scratch' : 'preserved & re-synced existing DI';
  console.log(`Layout ${mode} -> ${dest}`);
}

async function validate(path) {
  const xml = readFileSync(path, 'utf-8');
  let r;
  try {
    r = await validateModel(xml);
  } catch (err) {
    console.error(`INVALID: parse failed - ${err.message}`);
    process.exit(1);
  }
  if (r.warnings.length) {
    console.log(`Warnings (${r.warnings.length}):`);
    for (const w of r.warnings) console.log(`  ! ${w}`);
  }
  if (r.missing.length) {
    console.log(`Missing layout for ${r.missing.length} element(s) - run \`layout\` to fix:`);
    for (const m of r.missing) console.log(`  - ${m}`);
  }
  if (r.overlaps.length) {
    console.log(`Overlapping shapes (${r.overlaps.length}) - the diagram will look broken; re-run \`layout --rebuild\`:`);
    for (const o of r.overlaps.slice(0, 12)) console.log(`  - ${o}`);
  }
  if (r.ok) console.log('VALID: parses cleanly, every flow element has a shape, and no shapes overlap.');
  else process.exit(1);
}

async function lint(path) {
  const xml = readFileSync(path, 'utf-8');
  const findings = await lintModel(xml);
  if (findings.length) {
    console.log(`Found ${findings.length} control-flow issue(s):`);
    for (const f of findings) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('No control-flow anti-patterns found (gateway split/join families match; exclusive gateways have defaults).');
}

async function diff(aPath, bPath) {
  const d = await diffModels(readFileSync(aPath, 'utf-8'), readFileSync(bPath, 'utf-8'));
  const desc = (e) => `${e.name ? JSON.stringify(e.name) + ' ' : ''}[${e.type} #${e.id}]`;
  const out = [];
  if (d.added.length) { out.push(`Added (${d.added.length}):`); for (const e of d.added) out.push(`  + ${desc(e)}`); }
  if (d.removed.length) { out.push(`Removed (${d.removed.length}):`); for (const e of d.removed) out.push(`  - ${desc(e)}`); }
  if (d.renamed.length) { out.push(`Renamed (${d.renamed.length}):`); for (const r of d.renamed) out.push(`  ~ #${r.id}: ${JSON.stringify(r.from)} -> ${JSON.stringify(r.to)}`); }
  if (d.retyped.length) { out.push(`Retyped (${d.retyped.length}):`); for (const r of d.retyped) out.push(`  ~ #${r.id}: ${r.from} -> ${r.to}`); }
  if (d.rewired.length) { out.push(`Rewired flows (${d.rewired.length}):`); for (const r of d.rewired) out.push(`  ~ #${r.id}: ${r.from} => ${r.to}`); }
  console.log(out.length ? `Diff ${aPath} -> ${bPath}\n${out.join('\n')}` : 'No semantic differences.');
}

async function find(path, term) {
  const hits = await findModel(readFileSync(path, 'utf-8'), term);
  if (!hits.length) { console.log(`No elements match ${JSON.stringify(term || '')}.`); return; }
  console.log(`${hits.length} match(es):`);
  for (const h of hits) console.log(`  - ${h.name ? JSON.stringify(h.name) + ' ' : ''}[${h.type} #${h.id}]`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const flags = argv.filter((a) => a.startsWith('--'));
  const pos = argv.slice(1).filter((a) => !a.startsWith('--'));
  const [a, b] = pos;
  try {
    if (cmd === 'summarize' && a) await summarize(a, flags.includes('--json'));
    else if (cmd === 'layout' && a) await layout(a, b, flags.includes('--rebuild'));
    else if (cmd === 'validate' && a) await validate(a);
    else if (cmd === 'lint' && a) await lint(a);
    else if (cmd === 'diff' && a && b) await diff(a, b);
    else if (cmd === 'find' && a) await find(a, b);
    else {
      console.error('Usage:');
      console.error('  node bpmn-tool.mjs summarize <file.bpmn> [--json]');
      console.error('  node bpmn-tool.mjs layout    <in.bpmn> [out.bpmn] [--rebuild]');
      console.error('  node bpmn-tool.mjs validate  <file.bpmn>');
      console.error('  node bpmn-tool.mjs lint      <file.bpmn>');
      console.error('  node bpmn-tool.mjs diff      <a.bpmn> <b.bpmn>');
      console.error('  node bpmn-tool.mjs find      <file.bpmn> <term>');
      process.exit(2);
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

main();
