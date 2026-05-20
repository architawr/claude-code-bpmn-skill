# BPMN skill — full toolkit (design)

Date: 2026-05-21
Status: approved, implementing all phases in order (rendering excluded).

## Problem

The `bpmn` skill's `layout` command is **destructive**: it does
`defs.diagrams = []`, regenerates a single top-level plane via `bpmn-auto-layout`,
and collapses every sub-process into an empty box (`collapseSubProcessDI`). Run on
a Camunda export — which stores DI as a **separate diagram-page per sub-process**
(multi-diagram) — it discards all those drill-down planes, so every sub-process
appears empty in a modeler. The fault is in the auto-layout tool, not the file.

The skill also only covers single-pool processes: collaborations beyond the first
pool, expanded sub-processes, and data/message/annotation shapes are not laid out.

## Goal

Make the skill cover the full range of BPMN authoring/editing work:
- Editing an existing file must **preserve** its hand-tuned / multi-diagram DI.
- Layout must be **safe by default** — never silently destroy a good diagram.
- Broaden coverage: expanded sub-processes, multi-pool collaborations, data
  objects, message flows, associations, groups, text annotations.
- Deeper structural validation and control-flow lint.
- Utilities: diff between diagrams, query, id/name normalization.

Rendering to PNG/SVG is **explicitly out of scope** (per decision 2026-05-21).

## CLI contract (the one rule for the agent)

The edit loop is unchanged: `summarize → (hand-edit semantics) → layout → validate → lint`.
What changes is that `layout` is no longer destructive.

| Command | Behavior |
|---|---|
| `summarize <file> [--json]` | Structured outline (unchanged; extended in later phases) |
| `layout <file> [out]` | **Safe default**: existing DI → *resync* (preserve); no DI → generate from scratch |
| `layout <file> --rebuild` | Force full regeneration from scratch (the old behavior, now opt-in) |
| `validate <file>` | Parse + missing-shape + overlap; multi-plane / drill-down aware |
| `lint <file>` | Control-flow anti-patterns (extended in Phase 3) |
| `diff <a> <b>` | Semantic + structural diff (Phase 4) |

The agent's single, unbreakable rule: **"After editing semantics, always run
`layout`; it never destroys an existing diagram. Full rebuild is `--rebuild`
only, and only when explicitly requested."** No new verb for surgical editing —
fewer concepts, less confusion.

## Key finding (spike, 2026-05-21)

`bpmn-auto-layout` v0.5.0 **already emits a separate `BPMNDiagram`/plane per
sub-process** (a Camunda-style drill-down plane), with inner shapes in their own
coordinate space. The skill's `collapseSubProcessDI` then *deletes* those planes
— the direct cause of "empty sub-processes". It was added only because
`validate`'s overlap check pools shapes from all planes into one list, so inner
nodes (local coords overlapping the main plane) trip a false positive.

Consequences:
- The real Phase 1 fix is to **stop collapsing** and make `validate` partition
  overlap checks **per plane** + recognise drill-down planes. Sub-process layout
  then comes free from the library.
- Collaboration is still only the first participant (no pool shapes, no message
  flows, other pools undrawn) → real Phase 2 work.

## Architecture — DI resync (Phase 1 core)

`layout` in resync mode diffs element-ids between semantics and DI:

1. Parse the file (semantics + existing `defs.diagrams`; there may be several).
2. **Unchanged ids** (in both) → keep `BPMNShape`/`BPMNEdge` verbatim. So rename /
   retype / condition edits are **no-ops on geometry**.
3. **Removed ids** (in DI, not in semantics) → drop the shape, its edges, attached
   boundary-event shapes; if a sub-process was removed, drop its drill-down plane.
4. **New ids** (in semantics, not in DI) → create a shape with auto-placement plus
   simple orthogonal edges.

**Placement of a new shape:** on the plane of its container (main plane, or the
sub-process's drill-down plane). If an upstream neighbour already has a shape,
place to its right and nudge down until no atom-node overlap; otherwise at the
right edge of the plane's bounding box. Placement is approximate — report it so
the user can nudge in a modeler.

**Phase boundary:** Phase 1 *preserves* existing expanded / drill-down
sub-processes and adds nodes to the top-level process and to already-expanded
sub-processes. Adding children into a *collapsed* sub-process (which must be
expanded and given a plane) is Phase 2.

## Phases (implemented in order)

- **Phase 0 — Safe `layout` (foundation).** resync/generate dispatch + `--rebuild`.
  Update `SKILL.md`, `commands/edit.md`, `references/bpmn-reference.md`.
- **Phase 1 — Surgical edit with DI preservation.** Implement resync
  (preserve / prune / add-flat). Preserve multi-diagram planes. Make `validate`
  multi-plane aware (recognise a sub-process drill-down plane; require its
  children's DI).
- **Phase 2 — Full layout coverage.** Generate drill-down planes for expanded
  sub-processes (not empty boxes); lay out all collaboration pools; emit shapes
  for data objects, message flows, associations, groups, text annotations.
- **Phase 3 — Deeper `validate` + `lint`.** New rules: unreachable nodes, dangling
  `attachedToRef`, missing start/end, broader gateway balance; wider element
  coverage in `validate`.
- **Phase 4 — Utilities.** `diff <a> <b>` (semantic + structural) and
  `find <file> <term>` (query by name/type). **Id/name normalization is
  deliberately omitted:** silently rewriting element IDs breaks external
  references (Camunda job workers, links, history), so it's unsafe to automate -
  not worth the footgun.

## Testing

- Deterministic node test harness (`skills/bpmn/test/`) run via `npm test`,
  asserting the script's behavior directly (not LLM-graded).
- New fixture: a Camunda-style multi-diagram file with a sub-process drill-down
  plane.
- Phase 1 regressions: default `layout` preserves planes (sub-process not
  emptied); delete removes a node's shape/edges, rest intact; add places a shape
  with no overlap and `validate` passes; `--rebuild` does full regeneration.
- Update eval #2 (`edit-add-payment-check`): expectation changes from "DI
  regenerated" to "unchanged nodes' DI preserved, new nodes placed".
- Grading for the LLM evals stays `validate` + `lint` + fact checks via
  `bpmn-moddle`.

## Files touched

- `skills/bpmn/scripts/bpmn-tool.mjs` — main work
- `skills/bpmn/SKILL.md`, `commands/edit.md`, `skills/bpmn/references/bpmn-reference.md`
- `skills/bpmn/test/*` — new deterministic tests + fixtures
- `evals/evals.json`, `evals/files/*` — updated/added fixtures
