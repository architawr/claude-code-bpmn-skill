# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code **plugin** (and a one-plugin marketplace, `bpmn-tools`) for working
with BPMN 2.0 process diagrams. The shipped artifact is the **skill** at
`skills/bpmn/`; `commands/*.md` are slash-command wrappers that invoke it. The
plugin is consumed by a model, but all real mechanics are deterministic Node code
you can run and test directly.

## Commands

All Node work happens in `skills/bpmn/` (deps are **not** committed — run install first):

```bash
cd skills/bpmn && npm install      # one-time: fetches bpmn-moddle + bpmn-auto-layout
npm test                           # full suite (node --test, files in test/*.test.mjs)
node --test test/resync.test.mjs   # one test file
node --test --test-name-pattern "prunes" test/resync.test.mjs   # one test by name
```

The CLI (run from `skills/bpmn/`):

```bash
node scripts/bpmn-tool.mjs summarize <file.bpmn> [--json]
node scripts/bpmn-tool.mjs layout    <in.bpmn> [out.bpmn] [--rebuild]
node scripts/bpmn-tool.mjs validate  <file.bpmn>
node scripts/bpmn-tool.mjs lint      <file.bpmn>
node scripts/bpmn-tool.mjs diff      <a.bpmn> <b.bpmn>
node scripts/bpmn-tool.mjs find      <file.bpmn> <term>
```

## Architecture

**Two layers in every `.bpmn`.** Semantics (`bpmn:process` / `bpmn:collaboration`
— tasks, gateways, flows) and Diagram Interchange (`bpmndi:BPMNDiagram` — x/y
coordinates). The whole design rests on: **the model edits semantics; the script
owns the DI.** Never hand-write coordinates.

**`scripts/lib.mjs` is the single source of truth.** Every mechanic
(`layoutModel`, `validateModel`, `lintModel`, `summarizeText/Json`, `diffModels`,
`findModel`) lives here as a function over data. `scripts/bpmn-tool.mjs` is a thin
CLI that only formats output and sets exit codes. Add logic to `lib.mjs`, not the
CLI.

**The layout safety contract (do not regress this).** `layoutModel(xml, {rebuild})`:
- If the file already has DI and `rebuild` is falsy → **resync**: preserve all
  existing geometry, `pruneDI` (drop shapes/edges whose element was deleted — a
  deleted element leaves a `bpmnElement === undefined` dangling ref), `addDI`
  (auto-place shapes/edges for new elements), then `placeExtras`.
- If there's no DI, or `rebuild` is true → **generate** from scratch.
Layout is **non-destructive by default**. The historical bug this fixed: the old
code always regenerated and ran a `collapseSubProcessDI` that *deleted*
sub-process drill-down pages, emptying them. Do not reintroduce a destructive
default or sub-process collapsing.

**Generation strategies** (all in `lib.mjs`, dispatched by `generateLayout`):
- Plain single process → `bpmn-auto-layout`'s `layoutProcess`. Note: this library
  **already** emits a separate `BPMNDiagram` plane per sub-process (Camunda-style
  drill-down). Keep those planes.
- Collaboration → `generateCollaborationLayout`: lay out each pool's process in
  isolation, stack pools in vertical bands, route message flows. (`layoutProcess`
  only does the first participant, so this is built on top.)
- Process with lanes → `generateLanedLayout`: take auto-layout's x positions,
  re-stack nodes into lane bands, draw lane shapes, re-route edges orthogonally.
- `placeExtras` (runs after every path) places shapes/edges for data
  object/store references, text annotations, and associations.

**`validateModel` is plane-aware.** Overlap is checked **per plane** — sub-process
drill-down planes reuse the same local coordinate space as the main plane, so a
global overlap check would false-positive (this is why the old code collapsed).
A sub-process's children are required to have DI only when it's expanded inline or
has a drill-down plane.

**`lintModel`** finds control-flow bugs that are valid XML: gateway split/join
family mismatches (deadlock / token duplication), all-conditioned gateways with no
default, and per-container structural issues (unreachable nodes, dead ends,
missing start/end — run per process and recursively per sub-process).

## Working in this codebase

- TDD is the norm here: write a failing test in `skills/bpmn/test/` (fixtures in
  `test/fixtures/`) before changing `lib.mjs`. Most layout/validate behaviors are
  asserted against real generated DI, not mocks.
- `evals/` holds **LLM-graded** behavioral cases (`evals.json`) and triggering
  cases (`trigger-eval.json`) for the skill's `description`. They are not part of
  the shipped plugin and are graded by running the skill's own `validate`/`lint`.
- When changing behavior, also update the model-facing docs: `skills/bpmn/SKILL.md`
  (workflow/limits the model reads) and `skills/bpmn/references/bpmn-reference.md`
  (XML recipes). These are instructions to the model, not just humans.
- Group shapes are intentionally **not** auto-placed (no model membership to size
  from); id/name normalization is intentionally **not** offered (rewriting IDs
  breaks external references).
