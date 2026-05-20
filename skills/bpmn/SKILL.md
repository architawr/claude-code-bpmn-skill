---
name: bpmn
description: >-
  Read, explain, create, and edit BPMN 2.0 business-process diagrams (.bpmn XML).
  Use this whenever the user opens, reviews, summarizes, models, or modifies a
  process/workflow as BPMN - including swimlanes, pools, lanes, gateways, tasks,
  events, sequence flows, or boundary events. Trigger even when the user does not
  say "BPMN" explicitly but works with a .bpmn file, a process model/diagram, a
  workflow description they want turned into a diagram, or Camunda/Zeebe/Flowable/
  bpmn.io models. Produces valid BPMN 2.0 XML with a clean, auto-generated layout.
compatibility: Requires Node.js >= 18 and npm. On first use, run `npm install` in the skill folder to fetch bpmn-moddle and bpmn-auto-layout.
---

# BPMN 2.0: read and edit process diagrams

## What this skill does

Helps you understand existing `.bpmn` files in plain language and produce new or
edited ones that are **valid and visually clean** when opened in any modeler
(Camunda Modeler, bpmn.io, Cawemo, etc.).

The job splits cleanly:
- **You** do the semantic reasoning: what the process means, what to add or change.
- **The bundled script** does the deterministic mechanics: parsing, regenerating
  layout, and validating. Lean on it instead of hand-rolling these each time.

## The one idea that makes BPMN tractable: two layers

A `.bpmn` file holds two layers in one XML document:

1. **Semantics** - the actual process: `bpmn:process` with tasks, gateways,
   events, and `sequenceFlow`s connecting them. This is the meaning.
2. **Diagram interchange (DI)** - `bpmndi:BPMNDiagram` with x/y coordinates for
   every shape and waypoints for every edge. This is only the picture.

Editing DI by hand is where BPMN work goes wrong: coordinates drift, shapes
overlap, edges cross. **So we never hand-write DI.** You edit semantics; the
`layout` command owns the DI. That is exactly what makes the diagram "clear" - a
tidy left-to-right layout, generated deterministically.

`layout` is **non-destructive by default**, which is the rule that keeps you out
of trouble: on a file that already has a diagram it *preserves* the existing
layout and only syncs it to your edit (prune shapes for deleted elements, place
shapes for new ones). On a file with no DI it generates a fresh layout. It only
throws the whole diagram away and rebuilds from scratch when you pass
`--rebuild`. So the habit is simple: **after editing semantics, always run
`layout`; it never destroys a good diagram.**

## Setup (once per machine)

The script needs two npm packages. From the skill's own directory:

```bash
npm install --prefix "<SKILL_DIR>"
```

`<SKILL_DIR>` is the folder containing this SKILL.md. After that, the four
commands below are available. If a run fails with "Cannot find package", the
install step was skipped - run it and retry.

## Reading / explaining a diagram

1. Get a structured outline (don't try to read raw DI coordinates):
   ```bash
   node "<SKILL_DIR>/scripts/bpmn-tool.mjs" summarize path/to/file.bpmn
   ```
   This prints pools/lanes, start/end events, activities (with their type),
   gateways (with direction), boundary events (host + interrupting?), and every
   sequence flow as `source -> target [condition]`. Add `--json` if you want to
   process it programmatically.

2. Explain it the way a person would understand the process: the happy path
   first, then decision points (what each gateway branches on), parallel work,
   and exception/boundary handling. Name real business steps, not element IDs.
   Match the user's language.

The summarize output is your source of truth for "what does this diagram do" -
read from it rather than eyeballing the XML, especially for anything non-trivial.

When the user wants a **review** ("is this correct?", "find the bug", "why does
it hang?"), also run `lint`. It catches control-flow bugs that are valid XML and
pass `validate` but are wrong behavior - the kind that are easy to miss by eye:

```bash
node "<SKILL_DIR>/scripts/bpmn-tool.mjs" lint path/to/file.bpmn
```

It flags a parallel (AND) join fed by an exclusive (XOR) split (the join waits
for a token that never comes - **deadlock**), a parallel split merged by an
exclusive join (everything after runs **twice**), an exclusive gateway whose
conditions can all be false with no default (**stuck token**), nodes with no path
from a start event (**unreachable**), non-end nodes with no outgoing flow (**dead
end**), and a process missing a start or end event. Read its finding, confirm it
against the model, then explain it in plain terms.

## Creating or editing a diagram

Before writing XML for a *new* process, think like a business analyst and pin
down the structure - it's what separates a clear model from a box-and-arrow
mess. If any of these is unclear from the request, ask:

- **Trigger** - what starts the process (and is it a plain start, a message, a
  timer?).
- **Participants** - who does what. Multiple actors usually means lanes (one
  pool) or pools + message flows (separate processes).
- **Happy path** - the main sequence of activities when nothing goes wrong.
- **Decision points** - where the path forks, on what condition, and which
  gateway fits (exclusive = either/or, parallel = all, inclusive = one-or-more).
- **Exceptions / alternatives** - timeouts, rejections, errors; often boundary
  events or extra branches.
- **End states** - the distinct ways the process can finish.

If the user is documenting current vs future state, treat **As-Is** and
**To-Be** as separate diagrams/files and label them as such.

The reliable loop is then **edit semantics -> regenerate layout -> validate -> lint**:

1. **Write or change the semantics.** For a new diagram, hand-author a
   semantics-only document (no `bpmndi:` block) - it's compact and easy to get
   right. For an edit, run `summarize` first to understand the current model,
   then change the `bpmn:process` body. See `references/bpmn-reference.md` for
   the skeleton, every element's XML shape, and copy-paste recipes (exclusive /
   parallel / inclusive gateways, boundary events, pools, lanes, message flows).

2. **Lay out.** Sync the diagram to your edit:
   ```bash
   node "<SKILL_DIR>/scripts/bpmn-tool.mjs" layout in.bpmn out.bpmn
   ```
   Omit `out.bpmn` to rewrite the file in place. On a file that already has DI
   this *preserves* the existing layout (hand-tuned positions, Camunda
   multi-diagram sub-process pages) and only prunes/places shapes to match your
   change. On a brand-new semantics-only file it generates a clean layout. Add
   `--rebuild` only when the user explicitly wants the entire diagram re-laid-out
   from scratch (this discards any manual positioning - say so).

3. **Validate.** Confirm it parses, every flow element got a shape, and no shapes
   overlap:
   ```bash
   node "<SKILL_DIR>/scripts/bpmn-tool.mjs" validate out.bpmn
   ```
   Fix anything it flags (dangling refs surface as parse warnings; missing shapes
   usually mean you skipped `layout`; overlaps are checked per diagram plane, so a
   real overlap means a crowded layout - re-run `layout --rebuild`).

4. **Lint the control flow** - especially when you added or rewired gateways and
   branches:
   ```bash
   node "<SKILL_DIR>/scripts/bpmn-tool.mjs" lint out.bpmn
   ```
   `validate` proves the file is well-formed; `lint` proves the *logic* is sound.
   It catches the silent bugs: deadlock (parallel join after an exclusive split),
   double execution (exclusive join after a parallel split), stuck tokens
   (all-conditioned gateway with no default), unreachable nodes, dead ends, and a
   missing start/end event.

Don't claim a diagram is done until `validate` and `lint` both pass - they're
quick and catch the mistakes (typo'd refs, missing layout, gateway deadlocks)
that make a file look broken or hang in a real engine.

## Modeling for clarity, not just validity

Auto-layout handles *placement*; clarity also comes from how you model. A few
habits that make diagrams readable:

- **Name things in business terms.** Tasks as verb phrases ("Approve invoice"),
  gateways as the question they answer ("Amount > 1000?"), and label the
  outgoing flows with the answers ("yes" / "no").
- **Keep one start and clear ends.** Distinct end events for distinct outcomes
  read better than one catch-all end.
- **Pair your gateways.** A diverging gateway usually needs a converging one;
  give exclusive gateways a default/else so a token can't get stuck.
- **Don't overload one diagram.** If it sprawls, push detail into a sub-process.

## Auto-layout: what it covers

`layout` handles the full range of everyday BPMN, not just single-pool flows:

- **Collaborations:** every pool is laid out, stacked vertically, with message
  flows routed between them (not just the first participant).
- **Lanes (swimlanes):** nodes are placed in their lane's horizontal band and the
  lane shapes are drawn.
- **Sub-processes** get their own **drill-down diagram page** (a separate
  `BPMNDiagram` plane), exactly like a Camunda export: the sub-process shows as a
  box on the main canvas, and you "open" it to see its inner steps laid out on
  their own page. They are **not** flattened onto the main canvas and **not**
  emptied. `summarize` shows the inner steps; a modeler reveals them on open.
- **Data objects/stores, text annotations, associations** get shapes/edges placed
  next to the element they relate to.

Remaining limits, worth stating honestly when a request leans on them:

- **Groups** are not auto-placed (a group is a purely visual rectangle with no
  membership in the model, so there's nothing to size it from). Add one in a
  modeler if needed.
- Auto-placement of pools, lanes, data objects, and annotations is **approximate**
  - clean and valid, but a user may want to nudge spacing in a modeler.

Details and workarounds are in `references/bpmn-reference.md`.

## Bundled tools

| Command | Purpose |
|---|---|
| `summarize <file> [--json]` | Structured outline of the process(es), for explaining or for understanding before an edit |
| `layout <in> [out] [--rebuild]` | Sync the diagram to the semantics: preserve & update existing DI, or generate it if absent. `--rebuild` re-lays-out from scratch |
| `validate <file>` | Parse, report warnings, flag any flow element missing a shape or any per-plane overlapping shapes |
| `lint <file>` | Find control-flow logic bugs: gateway split/join mismatches (deadlock, double execution), stuck-token gateways, unreachable nodes, dead ends, missing start/end |

All four live in `scripts/bpmn-tool.mjs`. The deeper element reference,
recipes, and edge cases are in `references/bpmn-reference.md` - read it whenever
you need the exact XML for an element or pattern.
