#!/usr/bin/env node
/**
 * bpmn-tool.mjs - deterministic helpers for the `bpmn` skill.
 *
 * The model does the semantic reasoning (what the process is, what to change).
 * This script handles the fiddly, error-prone mechanics so every run does not
 * reinvent them:
 *
 *   summarize <file.bpmn> [--json]   Structured outline of a process, for explanation
 *   layout    <in.bpmn> [out.bpmn]   Regenerate clean DI (collapses sub-processes cleanly)
 *   validate  <file.bpmn>            Parse; flag missing shapes, overlaps, parse warnings
 *   lint      <file.bpmn>            Find control-flow bugs: gateway split/join mismatch
 *                                    (deadlock / double execution) and stuck-token gateways
 *
 * Run `npm install` once in the skill root before using (installs bpmn-moddle
 * and bpmn-auto-layout).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as moddlePkg from 'bpmn-moddle';

// bpmn-moddle has shipped both a default and a named export across versions;
// resolve defensively so the script does not break on a version bump.
const BpmnModdle = moddlePkg.BpmnModdle || moddlePkg.default || moddlePkg;

const shortType = (el) => (el && el.$type ? el.$type.replace(/^bpmn:/, '') : '');
// Prefix-agnostic local name (DI elements use the bpmndi: prefix, e.g. bpmndi:BPMNShape).
const localName = (el) => (el && el.$type ? el.$type.split(':').pop() : '');
const isFlowNode = (el) => typeof el.$instanceOf === 'function' && el.$instanceOf('bpmn:FlowNode');

function eventTrigger(el) {
  const defs = el.eventDefinitions || [];
  if (!defs.length) return null;
  return defs.map((d) => shortType(d).replace(/EventDefinition$/, '')).join('+');
}

function label(el) {
  if (!el) return '(none)';
  const name = el.name ? JSON.stringify(el.name) : '(unnamed)';
  let kind = shortType(el);
  const trig = el.eventDefinitions ? eventTrigger(el) : null;
  if (trig) kind += `:${trig}`;
  return `${name} [${kind} #${el.id}]`;
}

function categorize(container) {
  const out = {
    start: [], end: [], intermediate: [], boundary: [],
    activities: [], gateways: [], subprocesses: [], flows: [], data: [], other: [],
  };
  for (const el of container.flowElements || []) {
    const t = shortType(el);
    if (t === 'SequenceFlow') out.flows.push(el);
    else if (t === 'BoundaryEvent') out.boundary.push(el);
    else if (t === 'StartEvent') out.start.push(el);
    else if (t === 'EndEvent') out.end.push(el);
    else if (/Event$/.test(t)) out.intermediate.push(el);
    else if (/Gateway$/.test(t)) out.gateways.push(el);
    else if (t === 'SubProcess' || t === 'Transaction' || t === 'AdHocSubProcess') out.subprocesses.push(el);
    else if (/Task$/.test(t) || t === 'CallActivity') out.activities.push(el);
    else if (/^Data/.test(t)) out.data.push(el);
    else out.other.push(el);
  }
  return out;
}

function laneOf(container) {
  const map = {};
  for (const ls of container.laneSets || []) {
    for (const lane of ls.lanes || []) {
      for (const ref of lane.flowNodeRef || []) {
        map[ref.id] = lane.name || lane.id;
      }
    }
  }
  return map;
}

function flowEndpoint(ref) {
  if (!ref) return '?';
  return ref.name ? JSON.stringify(ref.name) : `#${ref.id}`;
}

function summarizeContainer(container, lines, indent = '') {
  const cat = categorize(container);
  const lanes = laneOf(container);
  const tag = (el) => (lanes[el.id] ? `  {lane: ${lanes[el.id]}}` : '');

  const section = (title, items, fmt) => {
    if (!items.length) return;
    lines.push(`${indent}${title}:`);
    for (const el of items) lines.push(`${indent}  - ${fmt(el)}`);
  };

  section('Start events', cat.start, (el) => label(el) + tag(el));
  section('Activities', cat.activities, (el) => label(el) + tag(el));
  section('Gateways', cat.gateways, (el) => {
    const dir = el.gatewayDirection ? ` (${el.gatewayDirection})` : '';
    return label(el) + dir + tag(el);
  });
  section('Intermediate events', cat.intermediate, (el) => label(el) + tag(el));
  section('Boundary events', cat.boundary, (el) => {
    const host = flowEndpoint(el.attachedToRef);
    const interrupting = el.cancelActivity === false ? 'non-interrupting' : 'interrupting';
    return `${label(el)} attached to ${host} (${interrupting})`;
  });
  section('End events', cat.end, (el) => label(el) + tag(el));
  section('Data', cat.data, (el) => label(el));
  section('Other', cat.other, (el) => label(el));

  if (cat.flows.length) {
    lines.push(`${indent}Sequence flows:`);
    for (const f of cat.flows) {
      const cond = f.conditionExpression && f.conditionExpression.body
        ? `  [condition: ${f.conditionExpression.body}]`
        : '';
      const name = f.name ? ` ("${f.name}")` : '';
      lines.push(`${indent}  - ${flowEndpoint(f.sourceRef)} -> ${flowEndpoint(f.targetRef)}${name}${cond}`);
    }
  }

  for (const sp of cat.subprocesses) {
    lines.push(`${indent}Sub-process ${label(sp)}:`);
    summarizeContainer(sp, lines, indent + '    ');
  }
}

async function summarize(path, asJson) {
  const xml = readFileSync(path, 'utf-8');
  const moddle = new BpmnModdle();
  const { rootElement: defs, warnings } = await moddle.fromXML(xml);

  const processes = (defs.rootElements || []).filter((r) => shortType(r) === 'Process');
  const collaboration = (defs.rootElements || []).find((r) => shortType(r) === 'Collaboration');

  if (asJson) {
    const dump = processes.map((p) => ({ id: p.id, name: p.name || null, ...categorizeIds(p) }));
    console.log(JSON.stringify({ processes: dump }, null, 2));
    return;
  }

  const lines = [];
  if (collaboration) {
    lines.push('Collaboration:');
    for (const p of collaboration.participants || []) {
      const ref = p.processRef ? `#${p.processRef.id}` : '(no process)';
      lines.push(`  - Pool ${JSON.stringify(p.name || p.id)} -> process ${ref}`);
    }
    for (const mf of collaboration.messageFlows || []) {
      lines.push(`  - Message flow: ${flowEndpoint(mf.sourceRef)} -> ${flowEndpoint(mf.targetRef)}`);
    }
    lines.push('');
  }

  for (const proc of processes) {
    const exec = proc.isExecutable ? 'executable' : 'non-executable';
    lines.push(`Process ${JSON.stringify(proc.name || proc.id)} #${proc.id} (${exec})`);
    summarizeContainer(proc, lines, '  ');
    lines.push('');
  }

  if (warnings && warnings.length) {
    lines.push(`Parse warnings: ${warnings.length}`);
    for (const w of warnings) lines.push(`  ! ${w.message}`);
  }

  console.log(lines.join('\n').trimEnd());
}

function categorizeIds(container) {
  const c = categorize(container);
  const ids = (arr) => arr.map((e) => ({ id: e.id, name: e.name || null, type: shortType(e) }));
  return {
    start: ids(c.start), end: ids(c.end), intermediate: ids(c.intermediate),
    boundary: ids(c.boundary), activities: ids(c.activities), gateways: ids(c.gateways),
    subprocesses: ids(c.subprocesses), data: ids(c.data),
    flows: c.flows.map((f) => ({
      id: f.id, name: f.name || null,
      source: f.sourceRef && f.sourceRef.id, target: f.targetRef && f.targetRef.id,
      condition: f.conditionExpression && f.conditionExpression.body,
    })),
  };
}

function normalizeFlowRefs(defs) {
  // bpmn-auto-layout draws edges from each node's incoming/outgoing refs, NOT
  // from sequenceFlow source/target. So we derive them here: the model only has
  // to write sequenceFlows, and we guarantee the arrows (and avoid the layout
  // crash that missing refs trigger).
  const containers = [];
  const collect = (c) => {
    if (!c.flowElements) return;
    containers.push(c);
    for (const el of c.flowElements) if (el.flowElements) collect(el);
  };
  for (const root of defs.rootElements || []) {
    if (shortType(root) === 'Process') collect(root);
  }
  for (const c of containers) {
    for (const el of c.flowElements) {
      if (isFlowNode(el)) { el.incoming = []; el.outgoing = []; }
    }
    for (const fe of c.flowElements) {
      if (shortType(fe) !== 'SequenceFlow') continue;
      const { sourceRef: s, targetRef: t } = fe;
      if (s && isFlowNode(s)) s.outgoing.push(fe);
      if (t && isFlowNode(t)) t.incoming.push(fe);
    }
  }
}

const isSubProcess = (el) => /SubProcess$|Transaction$|AdHocSubProcess$/.test(shortType(el));

// bpmn-auto-layout "collapses" sub-processes but still emits DI for their inner
// nodes at top-level coordinates, which overlaps everything else. Fix: drop the
// DI of anything nested inside a sub-process and mark the sub-process shape
// collapsed, so it renders as one clean box. Inner semantics are kept; if the
// detail must be drawn, model it as a separate top-level process.
async function collapseSubProcessDI(xml) {
  const moddle = new BpmnModdle();
  const { rootElement: defs } = await moddle.fromXML(xml);
  const nested = new Set();
  const collect = (container, inside) => {
    for (const el of container.flowElements || []) {
      if (inside) nested.add(el.id);
      if (el.flowElements) collect(el, inside || isSubProcess(el));
    }
  };
  for (const root of defs.rootElements || []) {
    if (shortType(root) === 'Process') collect(root, false);
  }
  if (!nested.size) return xml;
  for (const dia of defs.diagrams || []) {
    const plane = dia.plane;
    if (!plane) continue;
    plane.planeElement = (plane.planeElement || []).filter(
      (pe) => !(pe.bpmnElement && nested.has(pe.bpmnElement.id))
    );
    for (const pe of plane.planeElement) {
      if (pe.bpmnElement && isSubProcess(pe.bpmnElement)) pe.isExpanded = false;
    }
  }
  const { xml: out } = await moddle.toXML(defs);
  return out;
}

async function layout(inPath, outPath) {
  const { layoutProcess } = await import('bpmn-auto-layout');
  const moddle = new BpmnModdle();
  const { rootElement: defs } = await moddle.fromXML(readFileSync(inPath, 'utf-8'));
  defs.diagrams = []; // discard any existing DI; we regenerate it from scratch
  normalizeFlowRefs(defs);
  const { xml: normalized } = await moddle.toXML(defs);
  const laidOut = await collapseSubProcessDI(await layoutProcess(normalized));
  const dest = outPath || inPath;
  writeFileSync(dest, laidOut, 'utf-8');
  console.log(`Layout regenerated -> ${dest}`);
}

async function validate(path) {
  const xml = readFileSync(path, 'utf-8');
  const moddle = new BpmnModdle();
  let parsed;
  try {
    parsed = await moddle.fromXML(xml);
  } catch (err) {
    console.error(`INVALID: parse failed - ${err.message}`);
    process.exit(1);
  }
  const { rootElement: defs, warnings } = parsed;

  const diIds = new Set();
  const shapes = []; // { type, b } for overlap analysis
  const expandedById = new Map();
  for (const dia of defs.diagrams || []) {
    const plane = dia.plane;
    if (plane && plane.bpmnElement) diIds.add(plane.bpmnElement.id);
    for (const pe of (plane && plane.planeElement) || []) {
      if (pe.bpmnElement) diIds.add(pe.bpmnElement.id);
      if (localName(pe) === 'BPMNShape' && pe.bounds && pe.bpmnElement) {
        shapes.push({ type: shortType(pe.bpmnElement), id: pe.bpmnElement.id, b: pe.bounds });
        expandedById.set(pe.bpmnElement.id, pe.isExpanded === true);
      }
    }
  }

  // Overlap check: atom-node shapes (events, tasks, gateways) should not overlap.
  // Containers (pool/lane/sub-process) and boundary events legitimately do.
  const isAtom = (t) => ((/Event$/.test(t) && t !== 'BoundaryEvent') || /Task$/.test(t) || /Gateway$/.test(t) || t === 'CallActivity');
  const atoms = shapes.filter((s) => isAtom(s.type));
  const overlaps = [];
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const a = atoms[i].b, b = atoms[j].b, tol = 2;
      if (a.x < b.x + b.width - tol && a.x + a.width - tol > b.x && a.y < b.y + b.height - tol && a.y + a.height - tol > b.y) {
        overlaps.push(`${atoms[i].type}#${atoms[i].id} <> ${atoms[j].type}#${atoms[j].id}`);
      }
    }
  }

  const missing = [];
  const walk = (container) => {
    for (const el of container.flowElements || []) {
      // Only flow nodes and sequence flows are expected to have a shape/edge.
      // Data objects, groups, and annotations are intentionally not laid out.
      const core = isFlowNode(el) || shortType(el) === 'SequenceFlow';
      if (core && !diIds.has(el.id)) missing.push(el);
      // A collapsed sub-process intentionally hides its children, so don't
      // require DI for them; recurse only into expanded sub-processes / the process.
      const collapsed = isSubProcess(el) && diIds.has(el.id) && expandedById.get(el.id) !== true;
      if (el.flowElements && !collapsed) walk(el);
    }
  };
  for (const root of defs.rootElements || []) {
    if (shortType(root) === 'Process') walk(root);
  }

  let ok = true;
  if (warnings && warnings.length) {
    ok = false;
    console.log(`Warnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  ! ${w.message}`);
  }
  if (missing.length) {
    ok = false;
    console.log(`Missing layout for ${missing.length} element(s) - run \`layout\` to fix:`);
    for (const el of missing) console.log(`  - ${label(el)}`);
  }
  if (overlaps.length) {
    ok = false;
    console.log(`Overlapping shapes (${overlaps.length}) - the diagram will look broken; re-run \`layout\`:`);
    for (const o of overlaps.slice(0, 12)) console.log(`  - ${o}`);
  }
  if (ok) console.log('VALID: parses cleanly, every flow element has a shape, and no shapes overlap.');
  else process.exit(1);
}

const gwFamily = (t) =>
  t === 'ParallelGateway' ? 'AND'
  : t === 'ExclusiveGateway' ? 'XOR'
  : t === 'InclusiveGateway' ? 'OR'
  : t === 'EventBasedGateway' ? 'EVENT'
  : null;

function buildGraph(proc) {
  const nodes = new Map();
  const out = new Map();
  const inc = new Map();
  const outEdges = new Map(); // source id -> [sequenceFlow elements]
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  const collect = (c) => {
    for (const el of c.flowElements || []) {
      if (shortType(el) === 'SequenceFlow') {
        const s = el.sourceRef && el.sourceRef.id;
        const t = el.targetRef && el.targetRef.id;
        if (s && t) { push(out, s, t); push(inc, t, s); push(outEdges, s, el); }
      } else {
        nodes.set(el.id, el);
        if (el.flowElements) collect(el);
      }
    }
  };
  collect(proc);
  return { nodes, out, inc, outEdges };
}

// Walk backward from a node to the nearest diverging gateway (out-degree > 1).
function nearestDivergingUpstream(startId, out, inc, nodes) {
  const seen = new Set([startId]);
  const q = [...(inc.get(startId) || [])];
  while (q.length) {
    const id = q.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const el = nodes.get(id);
    if (el && /Gateway$/.test(shortType(el)) && (out.get(id) || []).length > 1) return id;
    for (const p of inc.get(id) || []) q.push(p);
  }
  return null;
}

async function lint(path) {
  const xml = readFileSync(path, 'utf-8');
  const moddle = new BpmnModdle();
  const { rootElement: defs } = await moddle.fromXML(xml);
  const findings = [];
  const nameOf = (el, id) => (el && el.name ? `"${el.name}"` : `#${id}`);

  for (const proc of (defs.rootElements || []).filter((r) => shortType(r) === 'Process')) {
    const { nodes, out, inc, outEdges } = buildGraph(proc);

    // Gateway split/join family mismatch: the classic deadlock / token-duplication bugs.
    for (const [id, el] of nodes) {
      if (!/Gateway$/.test(shortType(el))) continue;
      const incoming = inc.get(id) || [];
      if (incoming.length < 2) continue; // only converging gateways
      const jf = gwFamily(shortType(el));
      const splits = new Map();
      for (const s of incoming) {
        const sd = nearestDivergingUpstream(s, out, inc, nodes);
        if (sd) splits.set(sd, (splits.get(sd) || 0) + 1);
      }
      for (const [sid, count] of splits) {
        if (count < 2) continue;
        const S = nodes.get(sid);
        const sf = gwFamily(shortType(S));
        const jn = nameOf(el, id);
        const sn = nameOf(S, sid);
        if ((sf === 'XOR' || sf === 'OR') && jf === 'AND') {
          findings.push(`DEADLOCK: parallel (AND) join ${jn} merges branches that split at ${sf} gateway ${sn}. Only one branch ever gets a token, so the AND-join waits forever and the process hangs. Fix: make the join an exclusive/inclusive gateway matching the split.`);
        } else if (sf === 'AND' && (jf === 'XOR' || jf === 'OR')) {
          findings.push(`TOKEN DUPLICATION: ${jf} join ${jn} merges branches from a parallel (AND) split ${sn}. Every parallel token passes straight through, so everything after the merge runs more than once. Fix: synchronize with a parallel join.`);
        }
      }
    }

    // Diverging exclusive/inclusive gateway where EVERY branch is guarded by a
    // condition but none is the default -> if nothing matches, the token stops.
    // (An unconditioned outgoing flow already acts as an implicit else, so we
    // only flag the genuinely risky all-conditioned case.)
    for (const [id, el] of nodes) {
      const t = shortType(el);
      if ((t !== 'ExclusiveGateway' && t !== 'InclusiveGateway') || (out.get(id) || []).length <= 1 || el.default) continue;
      const oe = outEdges.get(id) || [];
      const allConditioned = oe.length > 0 && oe.every((f) => f.conditionExpression && f.conditionExpression.body);
      if (allConditioned) {
        findings.push(`NO DEFAULT: diverging ${t} ${nameOf(el, id)} has every outgoing flow guarded by a condition but no default. If none matches at runtime, the token stops here. Fix: mark one flow as default (or relax a condition).`);
      }
    }
  }

  if (findings.length) {
    console.log(`Found ${findings.length} control-flow issue(s):`);
    for (const f of findings) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('No control-flow anti-patterns found (gateway split/join families match; exclusive gateways have defaults).');
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === 'summarize' && a) await summarize(a, b === '--json' || process.argv.includes('--json'));
    else if (cmd === 'layout' && a) await layout(a, b && !b.startsWith('--') ? b : undefined);
    else if (cmd === 'validate' && a) await validate(a);
    else if (cmd === 'lint' && a) await lint(a);
    else {
      console.error('Usage:');
      console.error('  node bpmn-tool.mjs summarize <file.bpmn> [--json]');
      console.error('  node bpmn-tool.mjs layout    <in.bpmn> [out.bpmn]');
      console.error('  node bpmn-tool.mjs validate  <file.bpmn>');
      console.error('  node bpmn-tool.mjs lint      <file.bpmn>');
      process.exit(2);
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

main();
