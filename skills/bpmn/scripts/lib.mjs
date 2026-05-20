/**
 * lib.mjs - pure-ish library for the `bpmn` skill.
 *
 * The CLI (bpmn-tool.mjs) is a thin wrapper that formats/exits; all the
 * mechanics live here as functions that take/return data so they can be tested
 * directly. The model does the semantic reasoning; this code does the
 * deterministic layout/validation/lint work.
 */
import * as moddlePkg from 'bpmn-moddle';

// bpmn-moddle has shipped both a default and a named export across versions.
const BpmnModdle = moddlePkg.BpmnModdle || moddlePkg.default || moddlePkg;

export const shortType = (el) => (el && el.$type ? el.$type.replace(/^bpmn:/, '') : '');
// Prefix-agnostic local name (DI elements use the bpmndi: prefix).
export const localName = (el) => (el && el.$type ? el.$type.split(':').pop() : '');
export const isFlowNode = (el) => typeof el.$instanceOf === 'function' && el.$instanceOf('bpmn:FlowNode');
export const isSubProcess = (el) => /SubProcess$|Transaction$|AdHocSubProcess$/.test(shortType(el));

function eventTrigger(el) {
  const defs = el.eventDefinitions || [];
  if (!defs.length) return null;
  return defs.map((d) => shortType(d).replace(/EventDefinition$/, '')).join('+');
}

export function label(el) {
  if (!el) return '(none)';
  const name = el.name ? JSON.stringify(el.name) : '(unnamed)';
  let kind = shortType(el);
  const trig = el.eventDefinitions ? eventTrigger(el) : null;
  if (trig) kind += `:${trig}`;
  return `${name} [${kind} #${el.id}]`;
}

export async function parseBpmn(xml) {
  const moddle = new BpmnModdle();
  const { rootElement: defs, warnings } = await moddle.fromXML(xml);
  return { defs, warnings: warnings || [], moddle };
}

// --- Summarize ---

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
      for (const ref of lane.flowNodeRef || []) map[ref.id] = lane.name || lane.id;
    }
  }
  return map;
}

const flowEndpoint = (ref) => (!ref ? '?' : ref.name ? JSON.stringify(ref.name) : `#${ref.id}`);

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
        ? `  [condition: ${f.conditionExpression.body}]` : '';
      const name = f.name ? ` ("${f.name}")` : '';
      lines.push(`${indent}  - ${flowEndpoint(f.sourceRef)} -> ${flowEndpoint(f.targetRef)}${name}${cond}`);
    }
  }
  for (const sp of cat.subprocesses) {
    lines.push(`${indent}Sub-process ${label(sp)}:`);
    summarizeContainer(sp, lines, indent + '    ');
  }
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

export async function summarizeJson(xml) {
  const { defs } = await parseBpmn(xml);
  const processes = (defs.rootElements || []).filter((r) => shortType(r) === 'Process');
  return { processes: processes.map((p) => ({ id: p.id, name: p.name || null, ...categorizeIds(p) })) };
}

export async function summarizeText(xml) {
  const { defs, warnings } = await parseBpmn(xml);
  const processes = (defs.rootElements || []).filter((r) => shortType(r) === 'Process');
  const collaboration = (defs.rootElements || []).find((r) => shortType(r) === 'Collaboration');
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
  return lines.join('\n').trimEnd();
}

// --- Lint ---

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
  const outEdges = new Map();
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

// Per-container structural checks: reachability, dead ends, missing start/end.
// Worked per container (not flattened) because sequence flows never cross a
// sub-process boundary, so its inner nodes have their own start/reachability.
function structuralFindings(container, findings, isTop) {
  const nodes = new Map();
  const outE = new Map();
  const inE = new Map();
  const attach = new Map();
  for (const el of container.flowElements || []) if (shortType(el) !== 'SequenceFlow' && isFlowNode(el)) nodes.set(el.id, el);
  for (const el of container.flowElements || []) {
    if (shortType(el) !== 'SequenceFlow') continue;
    const s = el.sourceRef && el.sourceRef.id;
    const t = el.targetRef && el.targetRef.id;
    if (s && t) {
      if (!outE.has(s)) outE.set(s, []);
      outE.get(s).push(t);
      if (!inE.has(t)) inE.set(t, []);
      inE.get(t).push(s);
    }
  }
  for (const el of nodes.values()) {
    if (shortType(el) === 'BoundaryEvent' && el.attachedToRef) {
      const h = el.attachedToRef.id;
      if (!attach.has(h)) attach.set(h, []);
      attach.get(h).push(el.id);
    }
  }
  const starts = [...nodes.values()].filter((n) => shortType(n) === 'StartEvent');
  const ends = [...nodes.values()].filter((n) => shortType(n) === 'EndEvent');
  const where = isTop ? '' : ` (in sub-process #${container.id})`;

  if (isTop && nodes.size && !starts.length) {
    findings.push(`NO START: the process has no start event${where}. Nothing tells the engine where to begin. Fix: add a start event.`);
  }
  if (isTop && nodes.size && !ends.length) {
    findings.push(`NO END: the process has no end event${where}. Tokens have nowhere to finish. Fix: add an end event for each outcome.`);
  }

  if (starts.length) {
    const seen = new Set();
    const q = starts.map((s) => s.id);
    while (q.length) {
      const id = q.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const t of outE.get(id) || []) q.push(t);
      for (const b of attach.get(id) || []) q.push(b);
    }
    for (const [id, el] of nodes) {
      if (shortType(el) === 'StartEvent') continue;
      if (!seen.has(id)) findings.push(`UNREACHABLE: ${label(el)}${where} has no path from a start event, so it never executes. Fix: connect it with a sequence flow or remove it.`);
    }
  }

  for (const [id, el] of nodes) {
    if (shortType(el) === 'EndEvent') continue;
    if (!(outE.get(id) || []).length) findings.push(`DEAD END: ${label(el)}${where} has no outgoing sequence flow, so the token stops there. Fix: connect it onward or end the branch with an end event.`);
  }

  // Implicit split: a non-gateway node with several outgoing flows fans out in
  // parallel without saying so. Make the intent explicit with a gateway.
  for (const [id, el] of nodes) {
    if (/Gateway$/.test(shortType(el))) continue;
    const n = (outE.get(id) || []).length;
    if (n > 1) findings.push(`IMPLICIT SPLIT: ${label(el)}${where} has ${n} outgoing flows but is not a gateway, so it splits the token implicitly. Fix: route the branches through a parallel or exclusive gateway.`);
  }

  // Misdirected events: a start event should have no incoming, an end event no outgoing.
  for (const [id, el] of nodes) {
    if (shortType(el) === 'StartEvent' && (inE.get(id) || []).length) findings.push(`MISDIRECTED EVENT: start event ${label(el)}${where} has an incoming sequence flow; a start event only begins the process. Fix: remove the incoming flow or use an intermediate event.`);
    if (shortType(el) === 'EndEvent' && (outE.get(id) || []).length) findings.push(`MISDIRECTED EVENT: end event ${label(el)}${where} has an outgoing sequence flow; an end event terminates a path. Fix: remove the outgoing flow or use an intermediate event.`);
  }

  // Boundary events may only attach to activities (task / sub-process / call activity).
  const isActivity = (t) => /Task$/.test(t) || t === 'CallActivity' || /SubProcess$|Transaction$|AdHocSubProcess$/.test(t);
  for (const [, el] of nodes) {
    if (shortType(el) !== 'BoundaryEvent' || !el.attachedToRef) continue;
    const host = nodes.get(el.attachedToRef.id);
    if (host && !isActivity(shortType(host))) findings.push(`BAD BOUNDARY: boundary event ${label(el)}${where} is attached to a ${shortType(host)}, not an activity. Boundary events can only attach to tasks, sub-processes, or call activities.`);
  }

  // Lane membership: if the process uses lanes, every node should be in one.
  const lanes = (container.laneSets || []).flatMap((ls) => ls.lanes || []);
  if (lanes.length) {
    const assigned = new Set();
    for (const lane of lanes) for (const ref of lane.flowNodeRef || []) assigned.add(ref.id);
    for (const [id, el] of nodes) {
      if (shortType(el) === 'BoundaryEvent') continue; // inherit the host's lane
      if (!assigned.has(id)) findings.push(`UNASSIGNED NODE: ${label(el)}${where} is in no lane, though the process uses lanes. Fix: add it to a lane's flowNodeRef.`);
    }
  }
}

export async function lintModel(xml) {
  const { defs } = await parseBpmn(xml);
  const findings = [];
  const nameOf = (el, id) => (el && el.name ? `"${el.name}"` : `#${id}`);

  for (const proc of (defs.rootElements || []).filter((r) => shortType(r) === 'Process')) {
    const { nodes, out, inc, outEdges } = buildGraph(proc);

    for (const [id, el] of nodes) {
      if (!/Gateway$/.test(shortType(el))) continue;
      const incoming = inc.get(id) || [];
      if (incoming.length < 2) continue;
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

    for (const [id, el] of nodes) {
      const t = shortType(el);
      if ((t !== 'ExclusiveGateway' && t !== 'InclusiveGateway') || (out.get(id) || []).length <= 1 || el.default) continue;
      const oe = outEdges.get(id) || [];
      const allConditioned = oe.length > 0 && oe.every((f) => f.conditionExpression && f.conditionExpression.body);
      if (allConditioned) {
        findings.push(`NO DEFAULT: diverging ${t} ${nameOf(el, id)} has every outgoing flow guarded by a condition but no default. If none matches at runtime, the token stops here. Fix: mark one flow as default (or relax a condition).`);
      }
    }

    structuralFindings(proc, findings, true);
    const walkSub = (container) => {
      for (const el of container.flowElements || []) {
        if (isSubProcess(el)) { structuralFindings(el, findings, false); walkSub(el); }
      }
    };
    walkSub(proc);
  }

  // Message flows must cross pools; one that stays inside a single participant
  // should be a sequence flow.
  const collab = (defs.rootElements || []).find((r) => shortType(r) === 'Collaboration');
  if (collab) {
    const partOf = new Map();
    for (const p of collab.participants || []) {
      if (!p.processRef) continue;
      const walk = (c) => { for (const el of c.flowElements || []) { partOf.set(el.id, p.id); if (el.flowElements) walk(el); } };
      walk(p.processRef);
    }
    for (const mf of collab.messageFlows || []) {
      const s = mf.sourceRef && mf.sourceRef.id;
      const t = mf.targetRef && mf.targetRef.id;
      if (s && t && partOf.get(s) && partOf.get(s) === partOf.get(t)) {
        findings.push(`INTERNAL MESSAGE FLOW: message flow #${mf.id} connects two nodes in the same pool (${partOf.get(s)}); message flows must cross pools. Use a sequence flow within a pool.`);
      }
    }
  }
  return findings;
}

// --- Utilities: diff and find ---

const descOf = (el) => ({ id: el.id, name: el.name || null, type: shortType(el) });

function flowElemMap(defs) {
  const map = new Map();
  for (const root of defs.rootElements || []) {
    if (shortType(root) !== 'Process') continue;
    const walk = (c) => { for (const el of c.flowElements || []) { if (!map.has(el.id)) map.set(el.id, el); if (el.flowElements) walk(el); } };
    walk(root);
  }
  return map;
}

// Semantic + structural diff between two models: which elements were added,
// removed, renamed, retyped, and which sequence flows were rewired.
export async function diffModels(xmlA, xmlB) {
  const A = (await parseBpmn(xmlA)).defs;
  const B = (await parseBpmn(xmlB)).defs;
  const ma = flowElemMap(A);
  const mb = flowElemMap(B);
  const res = { added: [], removed: [], renamed: [], retyped: [], rewired: [] };
  const isFlow = (el) => shortType(el) === 'SequenceFlow';
  for (const [id, el] of mb) if (!ma.has(id)) res.added.push(descOf(el));
  for (const [id, el] of ma) if (!mb.has(id)) res.removed.push(descOf(el));
  for (const [id, a] of ma) {
    const b = mb.get(id);
    if (!b) continue;
    if (shortType(a) !== shortType(b)) res.retyped.push({ id, from: shortType(a), to: shortType(b) });
    else if (!isFlow(a) && (a.name || '') !== (b.name || '')) res.renamed.push({ id, from: a.name || '', to: b.name || '' });
    if (isFlow(a) && isFlow(b)) {
      const ea = `${a.sourceRef && a.sourceRef.id}->${a.targetRef && a.targetRef.id}`;
      const eb = `${b.sourceRef && b.sourceRef.id}->${b.targetRef && b.targetRef.id}`;
      if (ea !== eb) res.rewired.push({ id, from: ea, to: eb });
    }
  }
  return res;
}

// Find flow elements whose name or type contains the term (case-insensitive).
export async function findModel(xml, term) {
  const { defs } = await parseBpmn(xml);
  const t = (term || '').toLowerCase();
  const out = [];
  for (const c of containersOf(defs)) {
    for (const el of c.flowElements || []) {
      const name = (el.name || '').toLowerCase();
      const type = shortType(el).toLowerCase();
      if (!t || name.includes(t) || type.includes(t)) out.push(descOf(el));
    }
  }
  return out;
}

// Every Process container, recursively (process + nested sub-processes).
function containersOf(defs) {
  const out = [];
  const collect = (c) => {
    if (!c.flowElements) return;
    out.push(c);
    for (const el of c.flowElements) if (el.flowElements) collect(el);
  };
  for (const root of defs.rootElements || []) {
    if (shortType(root) === 'Process') collect(root);
  }
  return out;
}

// bpmn-auto-layout draws edges from each node's incoming/outgoing refs, not from
// sequenceFlow source/target. Derive them so the model only writes sequenceFlows
// and we still guarantee the arrows (and avoid the missing-ref layout crash).
function normalizeFlowRefs(defs) {
  for (const c of containersOf(defs)) {
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

// --- Collaboration layout (bpmn-auto-layout only does the first pool) ---

const POOL_LABEL_W = 30;
const POOL_MARGIN = 30;
const POOL_GAP = 60;

function allElementsById(defs) {
  const map = new Map();
  const add = (el) => { if (el && el.id) map.set(el.id, el); };
  for (const root of defs.rootElements || []) {
    if (shortType(root) === 'Collaboration') {
      for (const p of root.participants || []) add(p);
      for (const mf of root.messageFlows || []) add(mf);
    }
    if (shortType(root) === 'Process') {
      const walk = (c) => {
        for (const ls of c.laneSets || []) for (const lane of ls.lanes || []) add(lane);
        for (const el of c.flowElements || []) { add(el); if (el.flowElements) walk(el); }
      };
      add(root); walk(root);
    }
  }
  return map;
}

// Read a laid-out plane down to plain numbers, so we can rebuild DI in the final
// document referencing the final document's own elements.
function readPlaneCoords(plane) {
  const shapes = [];
  const edges = [];
  for (const pe of plane.planeElement || []) {
    if (localName(pe) === 'BPMNShape' && pe.bounds && pe.bpmnElement) {
      shapes.push({ id: pe.bpmnElement.id, x: pe.bounds.x, y: pe.bounds.y, width: pe.bounds.width, height: pe.bounds.height, isExpanded: pe.isExpanded === true });
    } else if (localName(pe) === 'BPMNEdge' && pe.bpmnElement) {
      edges.push({ id: pe.bpmnElement.id, waypoints: (pe.waypoint || []).map((w) => ({ x: w.x, y: w.y })) });
    }
  }
  return { shapes, edges };
}

const bboxOf = (shapes) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.width); maxY = Math.max(maxY, s.y + s.height);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

function addShapeAbs(moddle, plane, el, b, isExpanded) {
  const shape = moddle.create('bpmndi:BPMNShape', { id: el.id + '_di', bpmnElement: el, bounds: moddle.create('dc:Bounds', b) });
  if (isExpanded) shape.isExpanded = true;
  plane.planeElement.push(shape);
}

function addPlaneCoords(moddle, plane, elemById, data, dx, dy) {
  for (const s of data.shapes) {
    const el = elemById.get(s.id);
    if (!el) continue;
    addShapeAbs(moddle, plane, el, { x: s.x + dx, y: s.y + dy, width: s.width, height: s.height }, s.isExpanded);
  }
  for (const e of data.edges) {
    const el = elemById.get(e.id);
    if (!el) continue;
    const waypoint = e.waypoints.map((p) => moddle.create('dc:Point', { x: p.x + dx, y: p.y + dy }));
    plane.planeElement.push(moddle.create('bpmndi:BPMNEdge', { id: el.id + '_di', bpmnElement: el, waypoint }));
  }
}

async function singleProcessXml(semXml, processId) {
  const m = new BpmnModdle();
  const { rootElement: d } = await m.fromXML(semXml);
  d.rootElements = (d.rootElements || []).filter((r) => shortType(r) === 'Process' && r.id === processId);
  d.diagrams = [];
  const { xml } = await m.toXML(d);
  return xml;
}

async function generateCollaborationLayout(semXml, layoutProcess) {
  const moddle = new BpmnModdle();
  const { rootElement: defs } = await moddle.fromXML(semXml);
  const collab = (defs.rootElements || []).find((r) => shortType(r) === 'Collaboration');
  const elemById = allElementsById(defs);

  const collabPlane = moddle.create('bpmndi:BPMNPlane', { id: 'BPMNPlane_' + collab.id, bpmnElement: collab, planeElement: [] });
  defs.diagrams = [moddle.create('bpmndi:BPMNDiagram', { id: 'BPMNDiagram_' + collab.id, plane: collabPlane })];

  const pools = [];
  let cursorY = 0;
  for (const p of collab.participants || []) {
    if (!p.processRef) continue; // empty pool (black box): drawn separately if needed
    const laidXml = await layoutProcess(await singleProcessXml(semXml, p.processRef.id));
    const lm = new BpmnModdle();
    const { rootElement: laid } = await lm.fromXML(laidXml);

    const mainPlane = (laid.diagrams || []).find((d) => d.plane && d.plane.bpmnElement && d.plane.bpmnElement.id === p.processRef.id);
    const main = mainPlane ? readPlaneCoords(mainPlane.plane) : { shapes: [], edges: [] };
    const bb = bboxOf(main.shapes);
    const dx = POOL_LABEL_W + POOL_MARGIN - (isFinite(bb.minX) ? bb.minX : 0);
    const dy = cursorY + POOL_MARGIN - (isFinite(bb.minY) ? bb.minY : 0);

    const poolW = (isFinite(bb.width) ? bb.width : 200) + POOL_MARGIN * 2 + POOL_LABEL_W;
    const poolH = (isFinite(bb.height) ? bb.height : 100) + POOL_MARGIN * 2;
    const pool = moddle.create('bpmndi:BPMNShape', {
      id: p.id + '_di', bpmnElement: p, isHorizontal: true,
      bounds: moddle.create('dc:Bounds', { x: 0, y: cursorY, width: poolW, height: poolH }),
    });
    collabPlane.planeElement.push(pool);
    pools.push(pool);

    addPlaneCoords(moddle, collabPlane, elemById, main, dx, dy);

    // sub-process drill-down pages: keep their own coordinate space (own page)
    for (const d of laid.diagrams || []) {
      if (!d.plane || !d.plane.bpmnElement || d.plane.bpmnElement.id === p.processRef.id) continue;
      const sub = elemById.get(d.plane.bpmnElement.id);
      if (!sub) continue;
      const subPlane = moddle.create('bpmndi:BPMNPlane', { id: 'BPMNPlane_' + sub.id, bpmnElement: sub, planeElement: [] });
      addPlaneCoords(moddle, subPlane, elemById, readPlaneCoords(d.plane), 0, 0);
      defs.diagrams.push(moddle.create('bpmndi:BPMNDiagram', { id: 'BPMNDiagram_' + sub.id, plane: subPlane }));
    }

    cursorY += poolH + POOL_GAP;
  }

  // equalize pool widths so the diagram has clean, aligned right edges
  if (pools.length) {
    const maxW = Math.max(...pools.map((p) => p.bounds.width));
    for (const p of pools) p.bounds.width = maxW;
  }

  // message flows between pools
  const boundsIn = (id) => { const s = collabPlane.planeElement.find((pe) => pe.bpmnElement && pe.bpmnElement.id === id && pe.bounds); return s ? s.bounds : null; };
  for (const mf of collab.messageFlows || []) {
    const s = boundsIn(mf.sourceRef && mf.sourceRef.id);
    const t = boundsIn(mf.targetRef && mf.targetRef.id);
    if (!s || !t) continue;
    const [from, to] = s.y <= t.y
      ? [{ x: s.x + s.width / 2, y: s.y + s.height }, { x: t.x + t.width / 2, y: t.y }]
      : [{ x: s.x + s.width / 2, y: s.y }, { x: t.x + t.width / 2, y: t.y + t.height }];
    const waypoint = [moddle.create('dc:Point', from), moddle.create('dc:Point', to)];
    collabPlane.planeElement.push(moddle.create('bpmndi:BPMNEdge', { id: mf.id + '_di', bpmnElement: mf, waypoint }));
  }

  const { xml } = await moddle.toXML(defs, { format: true });
  return xml;
}

// --- Laned (swimlane) layout: bpmn-auto-layout ignores lanes entirely ---

const LANE_LABEL_W = 30;
const LANE_PAD = 20;
const LANE_H = 150;

const lanesOf = (proc) => {
  const out = [];
  for (const ls of proc.laneSets || []) for (const lane of ls.lanes || []) out.push(lane);
  return out;
};

function orthoWaypoints(moddle, a, b) {
  const P = (x, y) => moddle.create('dc:Point', { x, y });
  const ay = a.y + a.height / 2, by = b.y + b.height / 2;
  const ax = a.x + a.width, bx = b.x;
  if (Math.abs(ay - by) < 1) return [P(ax, ay), P(bx, by)];
  const midX = Math.round((ax + bx) / 2);
  return [P(ax, ay), P(midX, ay), P(midX, by), P(bx, by)];
}

// Take bpmn-auto-layout's horizontal placement (x positions) and re-stack the
// nodes into horizontal lane bands by their flowNodeRef, drawing lane shapes and
// re-routing edges orthogonally.
async function generateLanedLayout(semXml, layoutProcess) {
  const lm = new BpmnModdle();
  const { rootElement: laid } = await lm.fromXML(await layoutProcess(semXml));
  const base = readPlaneCoords(laid.diagrams[0].plane);
  if (!base.shapes.length) return await layoutProcess(semXml);

  const fm = new BpmnModdle();
  const { rootElement: defs } = await fm.fromXML(semXml);
  const elemById = allElementsById(defs);
  const proc = (defs.rootElements || []).find((r) => shortType(r) === 'Process');
  const lanes = lanesOf(proc);
  const laneOfNode = new Map();
  for (const lane of lanes) for (const ref of lane.flowNodeRef || []) laneOfNode.set(ref.id, lane.id);

  const plane = fm.create('bpmndi:BPMNPlane', { id: 'BPMNPlane_' + proc.id, bpmnElement: proc, planeElement: [] });
  defs.diagrams = [fm.create('bpmndi:BPMNDiagram', { id: 'BPMNDiagram_' + proc.id, plane })];

  const minX = Math.min(...base.shapes.map((s) => s.x));
  const maxRight = Math.max(...base.shapes.map((s) => s.x + s.width));
  const laneW = maxRight - minX + LANE_PAD * 2;
  const dx = LANE_LABEL_W + LANE_PAD - minX;

  const bandTop = new Map();
  lanes.forEach((lane, i) => {
    const y = i * LANE_H;
    bandTop.set(lane.id, y);
    addShapeAbs(fm, plane, elemById.get(lane.id), { x: LANE_LABEL_W, y, width: laneW, height: LANE_H }, false);
    plane.planeElement[plane.planeElement.length - 1].isHorizontal = true;
  });

  for (const s of base.shapes) {
    const el = elemById.get(s.id);
    if (!el) continue;
    const top = bandTop.has(laneOfNode.get(s.id)) ? bandTop.get(laneOfNode.get(s.id)) : 0;
    addShapeAbs(fm, plane, el, { x: s.x + dx, y: top + (LANE_H - s.height) / 2, width: s.width, height: s.height }, s.isExpanded);
  }

  const boundsIn = (id) => { const sh = plane.planeElement.find((pe) => pe.bpmnElement && pe.bpmnElement.id === id && pe.bounds); return sh ? sh.bounds : null; };
  for (const fe of proc.flowElements || []) {
    if (shortType(fe) !== 'SequenceFlow') continue;
    const a = boundsIn(fe.sourceRef && fe.sourceRef.id);
    const b = boundsIn(fe.targetRef && fe.targetRef.id);
    if (a && b) plane.planeElement.push(fm.create('bpmndi:BPMNEdge', { id: fe.id + '_di', bpmnElement: fe, waypoint: orthoWaypoints(fm, a, b) }));
  }

  const { xml } = await fm.toXML(defs, { format: true });
  return xml;
}

// Full regeneration from scratch: discard all DI and let bpmn-auto-layout
// rebuild it. Unlike the old tool, we keep the per-sub-process drill-down planes
// the library emits (no collapse) - `validate` is plane-aware instead.
async function generateLayout(xml) {
  const { layoutProcess } = await import('bpmn-auto-layout');
  const moddle = new BpmnModdle();
  const { rootElement: defs } = await moddle.fromXML(xml);
  const collab = (defs.rootElements || []).find((r) => shortType(r) === 'Collaboration');
  const lanedProc = (defs.rootElements || []).find((r) => shortType(r) === 'Process' && lanesOf(r).length);
  defs.diagrams = [];
  normalizeFlowRefs(defs);
  const { xml: normalized } = await moddle.toXML(defs);
  if (collab) return await generateCollaborationLayout(normalized, layoutProcess);
  if (lanedProc) return await generateLanedLayout(normalized, layoutProcess);
  return await layoutProcess(normalized);
}

// Remove DI that no longer matches the semantics: a deleted element leaves a
// shape/edge whose bpmnElement no longer resolves (undefined), and a deleted
// sub-process leaves a drill-down plane whose bpmnElement is gone. Drop both so
// the diagram stays in sync without touching the geometry we keep.
function pruneDI(defs) {
  defs.diagrams = (defs.diagrams || []).filter((d) => d.plane && d.plane.bpmnElement);
  for (const d of defs.diagrams) {
    d.plane.planeElement = (d.plane.planeElement || []).filter((pe) => pe.bpmnElement);
  }
}

// --- Auto-placement for newly added elements (resync) ---

const GAP = 50;
const sizeFor = (t) => {
  if (/Event$/.test(t)) return { width: 36, height: 36 };
  if (/Gateway$/.test(t)) return { width: 50, height: 50 };
  return { width: 100, height: 80 }; // tasks, call activity, sub-process
};

const overlaps = (a, b, tol = 4) =>
  a.x < b.x + b.width - tol && a.x + a.width - tol > b.x &&
  a.y < b.y + b.height - tol && a.y + a.height - tol > b.y;

const boundsOf = (plane, id) => {
  if (!id) return null;
  const s = (plane.planeElement || []).find((pe) => pe.bpmnElement && pe.bpmnElement.id === id && pe.bounds);
  return s ? s.bounds : null;
};

// Indexes of what already has DI and which plane belongs to which container.
function diIndex(defs) {
  const has = new Set();
  for (const d of defs.diagrams || []) {
    for (const pe of (d.plane && d.plane.planeElement) || []) {
      if (pe.bpmnElement) has.add(pe.bpmnElement.id);
    }
  }
  return has;
}
function planesByContainer(defs) {
  const map = new Map();
  for (const d of defs.diagrams || []) {
    if (d.plane && d.plane.bpmnElement) map.set(d.plane.bpmnElement.id, d.plane);
  }
  return map;
}

function makeShape(moddle, plane, el, x, y, width, height) {
  const shape = moddle.create('bpmndi:BPMNShape', {
    id: el.id + '_di',
    bpmnElement: el,
    bounds: moddle.create('dc:Bounds', { x, y, width, height }),
  });
  (plane.planeElement || (plane.planeElement = [])).push(shape);
  return shape;
}

// Slide a candidate box down until it clears every existing shape on the plane.
function nudge(plane, box) {
  const others = (plane.planeElement || []).filter((pe) => pe.bounds).map((pe) => pe.bounds);
  let tries = 0;
  while (tries++ < 500 && others.some((o) => overlaps(box, o))) box.y += box.height + 30;
  return box;
}

// Place one new node next to an already-placed neighbour. Returns false if no
// neighbour has a shape yet (caller retries it on a later pass).
function placeNode(moddle, plane, el, flows) {
  const { width, height } = sizeFor(shortType(el));

  // A boundary event hangs on the bottom edge of its host.
  if (shortType(el) === 'BoundaryEvent' && el.attachedToRef) {
    const b = boundsOf(plane, el.attachedToRef.id);
    if (b) { makeShape(moddle, plane, el, b.x + b.width / 2 - width / 2, b.y + b.height - height / 2, width, height); return true; }
  }

  // Nearest placed upstream (source) and downstream (target) neighbours.
  let up = null;
  let down = null;
  for (const f of flows) {
    if (!up && f.targetRef && f.targetRef.id === el.id) up = boundsOf(plane, f.sourceRef && f.sourceRef.id) || null;
    if (!down && f.sourceRef && f.sourceRef.id === el.id) down = boundsOf(plane, f.targetRef && f.targetRef.id) || null;
  }

  // Insertion between two placed nodes on a left-to-right path: open a gap by
  // shifting the downstream node (and everything past it) right, then drop the
  // new node onto the line aligned with its upstream neighbour. The shifted
  // nodes' edges get fixed afterwards by rerouteStaleEdges.
  if (up && down && down.x >= up.x) {
    const x = up.x + up.width + GAP;
    const delta = width + GAP;
    for (const pe of plane.planeElement || []) if (pe.bounds && pe.bounds.x >= down.x) pe.bounds.x += delta;
    const y = up.y + up.height / 2 - height / 2;
    makeShape(moddle, plane, el, ...Object.values(nudge(plane, { x, y, width, height })));
    return true;
  }

  const anchor = up || down;
  if (!anchor) return false;
  const x = up ? anchor.x + anchor.width + GAP : anchor.x - GAP - width;
  const y = anchor.y + anchor.height / 2 - height / 2;
  makeShape(moddle, plane, el, ...Object.values(nudge(plane, { x, y, width, height })));
  return true;
}

function placeRightmost(moddle, plane, el) {
  const { width, height } = sizeFor(shortType(el));
  let maxRight = 0;
  for (const pe of plane.planeElement || []) if (pe.bounds) maxRight = Math.max(maxRight, pe.bounds.x + pe.bounds.width);
  makeShape(moddle, plane, el, maxRight + GAP, 30, width, height);
}

function addEdge(moddle, plane, flow) {
  const s = boundsOf(plane, flow.sourceRef && flow.sourceRef.id);
  const t = boundsOf(plane, flow.targetRef && flow.targetRef.id);
  if (!s || !t) return; // an endpoint isn't on this plane; leave it for a modeler
  const edge = moddle.create('bpmndi:BPMNEdge', { id: flow.id + '_di', bpmnElement: flow, waypoint: orthoWaypoints(moddle, s, t) });
  (plane.planeElement || (plane.planeElement = [])).push(edge);
}

const pointNearBounds = (p, b, tol = 12) =>
  p.x >= b.x - tol && p.x <= b.x + b.width + tol && p.y >= b.y - tol && p.y <= b.y + b.height + tol;

// Re-route sequence-flow edges that no longer touch their endpoints (e.g. a flow
// was retargeted, or its node moved). Correct edges - endpoints still on their
// source/target shape - are left exactly as they are, so hand-tuned routing
// survives.
function rerouteStaleEdges(defs, moddle) {
  const planeOf = planesByContainer(defs);
  for (const c of containersOf(defs)) {
    const plane = planeOf.get(c.id);
    if (!plane) continue;
    for (const pe of plane.planeElement || []) {
      if (localName(pe) !== 'BPMNEdge' || !pe.bpmnElement || shortType(pe.bpmnElement) !== 'SequenceFlow') continue;
      const s = boundsOf(plane, pe.bpmnElement.sourceRef && pe.bpmnElement.sourceRef.id);
      const t = boundsOf(plane, pe.bpmnElement.targetRef && pe.bpmnElement.targetRef.id);
      if (!s || !t) continue;
      const wp = pe.waypoint || [];
      const ok = wp.length >= 2 && pointNearBounds(wp[0], s) && pointNearBounds(wp[wp.length - 1], t);
      if (!ok) pe.waypoint = orthoWaypoints(moddle, s, t);
    }
  }
}

// Give a shape (and edges) to every semantic element that lacks DI, placed next
// to its neighbours. Approximate but valid; existing geometry is untouched.
function addDI(defs, moddle) {
  const has = diIndex(defs);
  const planeOf = planesByContainer(defs);
  for (const c of containersOf(defs)) {
    const plane = planeOf.get(c.id);
    if (!plane) continue; // container has no plane yet (new expanded sub-process: Phase 2)
    const flows = (c.flowElements || []).filter((el) => shortType(el) === 'SequenceFlow');
    let pending = (c.flowElements || []).filter((el) => !has.has(el.id) && isFlowNode(el));
    let guard = pending.length + 2;
    while (pending.length && guard-- > 0) {
      const still = pending.filter((el) => !placeNode(moddle, plane, el, flows));
      if (still.length === pending.length) { for (const el of still) placeRightmost(moddle, plane, el); break; }
      pending = still;
    }
    for (const fe of flows) if (!has.has(fe.id)) addEdge(moddle, plane, fe);
  }
}

/**
 * Validate structure: parse cleanly, every flow element has a shape/edge, and no
 * atom shapes overlap. Multi-plane aware: overlap is checked per plane (a
 * sub-process drill-down plane reuses the same local coordinate space as the
 * main plane, which is not a real overlap), and a sub-process's children are
 * only required to have DI when the sub-process is expanded inline or has its
 * own drill-down plane.
 */
export async function validateModel(xml) {
  const { defs, warnings } = await parseBpmn(xml);

  const diIds = new Set();
  const planeContainers = new Set(); // ids that own a plane (drill-down)
  const expandedById = new Map();
  const planeShapeSets = []; // shapes grouped per plane, for per-plane overlap

  for (const d of defs.diagrams || []) {
    const plane = d.plane;
    if (!plane) continue;
    if (plane.bpmnElement) { diIds.add(plane.bpmnElement.id); planeContainers.add(plane.bpmnElement.id); }
    const shapes = [];
    for (const pe of plane.planeElement || []) {
      if (pe.bpmnElement) diIds.add(pe.bpmnElement.id);
      if (localName(pe) === 'BPMNShape' && pe.bounds && pe.bpmnElement) {
        shapes.push({ type: shortType(pe.bpmnElement), id: pe.bpmnElement.id, b: pe.bounds });
        expandedById.set(pe.bpmnElement.id, pe.isExpanded === true);
      }
    }
    planeShapeSets.push(shapes);
  }

  // Overlap check is per plane. Containers (sub-process/pool/lane) and boundary
  // events legitimately overlap; only atom nodes must not.
  const isAtom = (t) => ((/Event$/.test(t) && t !== 'BoundaryEvent') || /Task$/.test(t) || /Gateway$/.test(t) || t === 'CallActivity');
  const overlapsFound = [];
  for (const shapes of planeShapeSets) {
    const atoms = shapes.filter((s) => isAtom(s.type));
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        if (overlaps({ ...atoms[i].b }, atoms[j].b, 2)) {
          overlapsFound.push(`${atoms[i].type}#${atoms[i].id} <> ${atoms[j].type}#${atoms[j].id}`);
        }
      }
    }
  }

  const missing = [];
  const walk = (container) => {
    for (const el of container.flowElements || []) {
      const core = isFlowNode(el) || shortType(el) === 'SequenceFlow';
      if (core && !diIds.has(el.id)) missing.push(label(el));
      // Recurse into a sub-process only when its detail is meant to be drawn:
      // expanded inline, or it has a drill-down plane. A plain collapsed box
      // hides its children on purpose, so they aren't required.
      const detailed = isSubProcess(el) && (expandedById.get(el.id) === true || planeContainers.has(el.id));
      if (el.flowElements && (!isSubProcess(el) || detailed)) walk(el);
    }
  };
  for (const root of defs.rootElements || []) if (shortType(root) === 'Process') walk(root);

  const ok = !(warnings.length || missing.length || overlapsFound.length);
  return { ok, warnings: warnings.map((w) => w.message), missing, overlaps: overlapsFound };
}

// --- Data objects, text annotations, associations (auto-layout draws none) ---

function addArtifactEdge(moddle, plane, el, srcId, tgtId) {
  const a = boundsOf(plane, srcId);
  const b = boundsOf(plane, tgtId);
  if (!a || !b) return;
  plane.planeElement.push(moddle.create('bpmndi:BPMNEdge', { id: el.id + '_di', bpmnElement: el, waypoint: orthoWaypoints(moddle, a, b) }));
}

function dataAnchor(container, dataId, plane) {
  for (const el of container.flowElements || []) {
    for (const a of el.dataOutputAssociations || []) if (a.targetRef && a.targetRef.id === dataId) { const b = boundsOf(plane, el.id); if (b) return b; }
    for (const a of el.dataInputAssociations || []) for (const s of a.sourceRef || []) if (s.id === dataId) { const b = boundsOf(plane, el.id); if (b) return b; }
  }
  return null;
}

function annotationAnchor(container, annId, plane) {
  for (const ar of container.artifacts || []) {
    if (shortType(ar) !== 'Association') continue;
    if (ar.targetRef && ar.targetRef.id === annId) { const b = boundsOf(plane, ar.sourceRef && ar.sourceRef.id); if (b) return b; }
    if (ar.sourceRef && ar.sourceRef.id === annId) { const b = boundsOf(plane, ar.targetRef && ar.targetRef.id); if (b) return b; }
  }
  return null;
}

// Give shapes to data object/store references and text annotations, and edges to
// associations and data associations. These have no auto-layout, so we place
// them next to the node they relate to. Runs after the main layout, on any plane.
async function placeExtras(xml) {
  const { defs, moddle } = await parseBpmn(xml);
  const has = diIndex(defs);
  const planeOf = planesByContainer(defs);
  let changed = false;
  for (const c of containersOf(defs)) {
    const plane = planeOf.get(c.id);
    if (!plane) continue;

    for (const el of c.flowElements || []) {
      const t = shortType(el);
      if ((t !== 'DataObjectReference' && t !== 'DataStoreReference') || has.has(el.id)) continue;
      const size = t === 'DataStoreReference' ? { width: 50, height: 50 } : { width: 36, height: 50 };
      const anchor = dataAnchor(c, el.id, plane);
      const start = anchor
        ? { x: anchor.x + anchor.width / 2 - size.width / 2, y: anchor.y + anchor.height + 50 }
        : { x: 100, y: 250 };
      const b = nudge(plane, { ...start, ...size });
      makeShape(moddle, plane, el, b.x, b.y, b.width, b.height);
      changed = true;
    }

    for (const el of c.artifacts || []) {
      if (shortType(el) !== 'TextAnnotation' || has.has(el.id)) continue;
      const size = { width: 120, height: 40 };
      const anchor = annotationAnchor(c, el.id, plane);
      const start = anchor
        ? { x: anchor.x + anchor.width + 50, y: Math.max(0, anchor.y - 50) }
        : { x: 100, y: 0 };
      const b = nudge(plane, { ...start, ...size });
      makeShape(moddle, plane, el, b.x, b.y, b.width, b.height);
      changed = true;
    }

    for (const el of c.artifacts || []) {
      if (shortType(el) !== 'Association' || has.has(el.id)) continue;
      addArtifactEdge(moddle, plane, el, el.sourceRef && el.sourceRef.id, el.targetRef && el.targetRef.id);
      changed = true;
    }
    for (const el of c.flowElements || []) {
      for (const a of el.dataOutputAssociations || []) {
        if (has.has(a.id)) continue;
        addArtifactEdge(moddle, plane, a, el.id, a.targetRef && a.targetRef.id); changed = true;
      }
      for (const a of el.dataInputAssociations || []) {
        if (has.has(a.id)) continue;
        addArtifactEdge(moddle, plane, a, a.sourceRef && a.sourceRef[0] && a.sourceRef[0].id, el.id); changed = true;
      }
    }
  }
  return changed ? (await moddle.toXML(defs, { format: true })).xml : xml;
}

/**
 * Safe layout. With existing DI (and no rebuild) it preserves the diagram and
 * only re-syncs it to the semantics (prune removed elements, place new ones).
 * With no DI, or rebuild:true, it regenerates from scratch. In every case data
 * objects, annotations, and associations are placed afterwards.
 */
export async function layoutModel(xml, opts = {}) {
  const { defs, moddle } = await parseBpmn(xml);
  const hasDI = (defs.diagrams || []).length > 0;
  let out;
  if (opts.rebuild || !hasDI) {
    out = await generateLayout(xml);
  } else {
    // resync: preserve existing geometry; prune removed, place new, fix stale edges.
    pruneDI(defs);
    addDI(defs, moddle);
    rerouteStaleEdges(defs, moddle);
    out = (await moddle.toXML(defs, { format: true })).xml;
  }
  return await placeExtras(out);
}
