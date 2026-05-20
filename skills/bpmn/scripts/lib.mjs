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
  }
  return findings;
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

// Full regeneration from scratch: discard all DI and let bpmn-auto-layout
// rebuild it. Unlike the old tool, we keep the per-sub-process drill-down planes
// the library emits (no collapse) - `validate` is plane-aware instead.
async function generateLayout(xml) {
  const { layoutProcess } = await import('bpmn-auto-layout');
  const moddle = new BpmnModdle();
  const { rootElement: defs } = await moddle.fromXML(xml);
  defs.diagrams = [];
  normalizeFlowRefs(defs);
  const { xml: normalized } = await moddle.toXML(defs);
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
  let anchor = null;
  let side = 'right';
  for (const f of flows) {
    if (f.targetRef && f.targetRef.id === el.id) {
      const b = boundsOf(plane, f.sourceRef && f.sourceRef.id);
      if (b) { anchor = b; side = 'right'; break; }
    }
  }
  if (!anchor) {
    for (const f of flows) {
      if (f.sourceRef && f.sourceRef.id === el.id) {
        const b = boundsOf(plane, f.targetRef && f.targetRef.id);
        if (b) { anchor = b; side = 'left'; break; }
      }
    }
  }
  if (!anchor && shortType(el) === 'BoundaryEvent' && el.attachedToRef) {
    const b = boundsOf(plane, el.attachedToRef.id);
    if (b) {
      makeShape(moddle, plane, el, b.x + b.width / 2 - width / 2, b.y + b.height - height / 2, width, height);
      return true;
    }
  }
  if (!anchor) return false;
  const x = side === 'right' ? anchor.x + anchor.width + GAP : anchor.x - GAP - width;
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
  const waypoint = [
    moddle.create('dc:Point', { x: s.x + s.width, y: s.y + s.height / 2 }),
    moddle.create('dc:Point', { x: t.x, y: t.y + t.height / 2 }),
  ];
  const edge = moddle.create('bpmndi:BPMNEdge', { id: flow.id + '_di', bpmnElement: flow, waypoint });
  (plane.planeElement || (plane.planeElement = [])).push(edge);
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

/**
 * Safe layout. With existing DI (and no rebuild) it preserves the diagram and
 * only re-syncs it to the semantics (prune removed elements, place new ones).
 * With no DI, or rebuild:true, it regenerates from scratch.
 */
export async function layoutModel(xml, opts = {}) {
  const { defs, moddle } = await parseBpmn(xml);
  const hasDI = (defs.diagrams || []).length > 0;
  if (opts.rebuild || !hasDI) {
    return await generateLayout(xml);
  }
  // resync: preserve existing geometry; prune removed, place new.
  pruneDI(defs);
  addDI(defs, moddle);
  const { xml: out } = await moddle.toXML(defs);
  return out;
}
