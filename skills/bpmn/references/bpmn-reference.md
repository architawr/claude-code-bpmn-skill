# BPMN 2.0 reference

Authoring recipes and an element cheat-sheet. Read this when you need the exact
XML shape of an element or a pattern. Spec: https://www.omg.org/spec/BPMN/2.0/

## Table of contents
- [Namespaces and skeleton](#namespaces-and-skeleton)
- [Core elements cheat-sheet](#core-elements-cheat-sheet)
- [Recipes](#recipes)
- [Pools, lanes, message flows](#pools-lanes-message-flows)
- [Auto-layout limits and workarounds](#auto-layout-limits-and-workarounds)
- [Control-flow pitfalls (run `lint`)](#control-flow-pitfalls-run-lint)
- [Other common mistakes](#other-common-mistakes)

## Namespaces and skeleton

A diagram is one `bpmn:definitions` document. The **semantics** live under
`bpmn:process` / `bpmn:collaboration`; the **visuals** (DI) live under
`bpmndi:BPMNDiagram`. You write semantics by hand and let `layout` generate the DI,
so the skeleton you author omits `bpmndi:` entirely:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
    xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    id="Definitions_1"
    targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <!-- flow nodes and sequence flows go here -->
  </bpmn:process>
</bpmn:definitions>
```

`layout` adds the `xmlns:bpmndi` / `xmlns:dc` / `xmlns:di` declarations and the
`<bpmndi:BPMNDiagram>` block. You never hand-write coordinates.

## Core elements cheat-sheet

| Concept | Element | Notes |
|---|---|---|
| Process start | `bpmn:startEvent` | Add `eventDefinitions` for message/timer/etc. |
| Process end | `bpmn:endEvent` | Use `bpmn:terminateEventDefinition` to kill the whole process |
| Plain step | `bpmn:task` | Generic; prefer a specific type below when it adds meaning |
| Human step | `bpmn:userTask` | |
| Automated call | `bpmn:serviceTask` | |
| Script | `bpmn:scriptTask` | `scriptFormat`, child `bpmn:script` |
| Decision | `bpmn:businessRuleTask` | |
| Reusable process | `bpmn:callActivity` | `calledElement` |
| Container | `bpmn:subProcess` | Holds its own `flowElements` |
| Either/or branch | `bpmn:exclusiveGateway` | One path; conditions on outgoing flows |
| All paths | `bpmn:parallelGateway` | Fork/join, no conditions |
| One-or-more | `bpmn:inclusiveGateway` | Conditions; multiple paths can fire |
| Wait-for-event | `bpmn:eventBasedGateway` | Followed by catch events |
| Connection | `bpmn:sequenceFlow` | `sourceRef`, `targetRef` |
| Attached event | `bpmn:boundaryEvent` | `attachedToRef`, `cancelActivity` |

**Event triggers** (child of an event, in `eventDefinitions`):
`messageEventDefinition`, `timerEventDefinition`, `errorEventDefinition`,
`signalEventDefinition`, `escalationEventDefinition`, `conditionalEventDefinition`,
`terminateEventDefinition`, `linkEventDefinition`, `compensateEventDefinition`.

**Omit `incoming`/`outgoing` child refs on flow nodes.** Just write the
`sequenceFlow`s. The `layout` command derives `incoming`/`outgoing` from them
before laying out - auto-layout needs those refs to draw the arrows, and missing
them makes it crash. Letting the script own this keeps your XML minimal and the
edges guaranteed.

## Recipes

### Linear flow
```xml
<bpmn:startEvent id="Start_1" name="Order received"/>
<bpmn:task id="Task_1" name="Pick items"/>
<bpmn:task id="Task_2" name="Ship order"/>
<bpmn:endEvent id="End_1" name="Order shipped"/>
<bpmn:sequenceFlow id="f1" sourceRef="Start_1" targetRef="Task_1"/>
<bpmn:sequenceFlow id="f2" sourceRef="Task_1" targetRef="Task_2"/>
<bpmn:sequenceFlow id="f3" sourceRef="Task_2" targetRef="End_1"/>
```

### Exclusive gateway (either/or) with conditions
Name the gateway as a question; name each outgoing flow as the answer and add a
`conditionExpression`. Always provide a default or an else-branch so the token
cannot get stuck.
```xml
<bpmn:exclusiveGateway id="Gw_1" name="In stock?" default="f_no"/>
<bpmn:sequenceFlow id="f_yes" name="yes" sourceRef="Gw_1" targetRef="Task_ship">
  <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${inStock == true}</bpmn:conditionExpression>
</bpmn:sequenceFlow>
<bpmn:sequenceFlow id="f_no" name="no" sourceRef="Gw_1" targetRef="Task_backorder"/>
```

### Parallel gateway (fork then join)
Use a matching pair: one diverging, one converging. No conditions on the flows.
```xml
<bpmn:parallelGateway id="Fork_1" name=""/>
<bpmn:parallelGateway id="Join_1" name=""/>
<bpmn:sequenceFlow id="f_a" sourceRef="Fork_1" targetRef="Task_A"/>
<bpmn:sequenceFlow id="f_b" sourceRef="Fork_1" targetRef="Task_B"/>
<bpmn:sequenceFlow id="f_a2" sourceRef="Task_A" targetRef="Join_1"/>
<bpmn:sequenceFlow id="f_b2" sourceRef="Task_B" targetRef="Join_1"/>
```

### Boundary event (e.g. timeout on a task)
```xml
<bpmn:userTask id="Task_review" name="Review request"/>
<bpmn:boundaryEvent id="Bnd_1" name="3 days" attachedToRef="Task_review" cancelActivity="true">
  <bpmn:timerEventDefinition/>
</bpmn:boundaryEvent>
<bpmn:sequenceFlow id="f_to" sourceRef="Bnd_1" targetRef="Task_escalate"/>
```

## Pools, lanes, message flows

Two participants that exchange messages = a `bpmn:collaboration` with two pools,
each pointing at its own `bpmn:process`. Lanes group nodes inside one process.

```xml
<bpmn:collaboration id="Collab_1">
  <bpmn:participant id="Pool_cust" name="Customer" processRef="Process_cust"/>
  <bpmn:participant id="Pool_shop" name="Shop" processRef="Process_shop"/>
  <bpmn:messageFlow id="m1" sourceRef="Task_order" targetRef="Start_shop"/>
</bpmn:collaboration>
```

Lanes inside a process:
```xml
<bpmn:process id="Process_shop">
  <bpmn:laneSet id="ls_1">
    <bpmn:lane id="Lane_sales" name="Sales">
      <bpmn:flowNodeRef>Task_quote</bpmn:flowNodeRef>
    </bpmn:lane>
    <bpmn:lane id="Lane_wh" name="Warehouse">
      <bpmn:flowNodeRef>Task_pack</bpmn:flowNodeRef>
    </bpmn:lane>
  </bpmn:laneSet>
  <!-- flow nodes + sequence flows -->
</bpmn:process>
```

## Auto-layout limits and workarounds

`layout` (bpmn-auto-layout) is great for ordinary processes but does **not** lay
out everything. Know these before promising a clean diagram:

- **Collaboration:** only the *first* participant's process is laid out. For a
  multi-pool diagram, tell the user the other pools will need manual placement in
  a modeler, or model each process separately.
- **Sub-processes** get their own **drill-down diagram page** - a separate
  `bpmndi:BPMNDiagram` plane whose `bpmnElement` is the sub-process, with the
  inner nodes laid out in their own coordinate space (exactly how Camunda stores
  them). The sub-process appears as a box on the main canvas and "opens" to that
  page; the inner steps are **not** flattened onto the main canvas and **not**
  emptied. `validate` checks overlap per plane, so the reused local coordinates
  are not a false overlap.
- **Not laid out at all:** groups, text annotations, associations, message flows,
  data objects/stores. The semantics are kept, but no shape/edge is generated.

If a diagram leans on these, say so plainly rather than claiming a clean render.
For everything else (single-pool flows with events, tasks, gateways, boundary
events), auto-layout produces a tidy left-to-right diagram.

## Control-flow pitfalls (run `lint`)

These are *logic* bugs: the XML is well-formed and passes `validate`, but the
process misbehaves at runtime. They are hard to spot by eye, so `lint` checks
for them. The rule of thumb: **a split and the join that re-merges its branches
should be the same gateway family.**

- **Deadlock - AND-join after an XOR/OR split.** An exclusive (or inclusive)
  gateway sends a token down *one* branch, but a parallel (AND) gateway merges
  those branches and waits for *all* of them. The missing tokens never arrive, so
  the join blocks forever and everything after it never runs.
  *Fix:* make the join exclusive/inclusive to match the split.

  ```
  XOR split ──a──▶ [Task A] ──▶╲
            └─b──▶ [Task B] ──▶ AND join  ✗ deadlock (waits for both a and b)
  ```

- **Double execution - XOR-join after an AND split.** A parallel gateway forks
  two tokens, but an exclusive gateway merges them. An XOR-join passes each token
  straight through, so every step after the merge runs once per token.
  *Fix:* synchronize with a parallel (AND) join.

- **Stuck token - all-conditioned exclusive gateway, no default.** If every
  outgoing flow has a condition and none is the default, a runtime case where
  nothing matches leaves the token with nowhere to go.
  *Fix:* mark one flow `default=`, or leave one flow unconditioned as the else.

## Other common mistakes

- **Hand-writing DI.** Don't. Author semantics, run `layout`. Manual coordinates
  drift out of sync and are the main source of broken-looking diagrams.
- **Gateway with no merge.** A diverging gateway usually needs a converging
  counterpart; otherwise tokens multiply or hang.
- **Dangling refs.** Every `sourceRef`/`targetRef`/`attachedToRef` must point at
  an existing `id`. Run `validate` after edits to catch this and missing shapes.
- **Mixing model namespaces.** Keep the `bpmn:` prefix consistent; let `layout`
  own the `bpmndi:`/`dc:`/`di:` namespaces.
