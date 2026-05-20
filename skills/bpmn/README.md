# bpmn — read & edit BPMN 2.0 diagrams

A Claude Code skill for working with **BPMN 2.0** process diagrams (`.bpmn` XML):
read and explain them in plain language, and create or edit them so they come out
**valid and visually clean** in any modeler (Camunda Modeler, bpmn.io, Cawemo…).

The division of labour: the model does the semantic reasoning (what the process
means, what to change); a small bundled Node script does the deterministic,
error-prone mechanics — parsing, regenerating layout, validating, and linting.

## Requirements

- Node.js >= 18 and npm
- No network access needed at run time after the one-time install

## Install

The skill ships without `node_modules`. Once, from the skill folder:

```bash
npm install
```

This fetches [`bpmn-moddle`](https://github.com/bpmn-io/bpmn-moddle) (read/write
BPMN XML) and [`bpmn-auto-layout`](https://github.com/bpmn-io/bpmn-auto-layout)
(generate clean diagram layout).

## Commands

```bash
node scripts/bpmn-tool.mjs summarize <file.bpmn> [--json]            # structured outline, for explaining
node scripts/bpmn-tool.mjs layout    <in.bpmn> [out.bpmn] [--rebuild] # sync diagram to semantics (safe by default)
node scripts/bpmn-tool.mjs validate  <file.bpmn>                     # parse + missing-shape + per-plane overlap
node scripts/bpmn-tool.mjs lint      <file.bpmn>                     # control-flow logic bugs
node scripts/bpmn-tool.mjs diff      <a.bpmn> <b.bpmn>               # semantic + structural diff
node scripts/bpmn-tool.mjs find      <file.bpmn> <term>             # locate elements by name/type
```

- **summarize** — pools/lanes, events, activities, gateways (with direction),
  boundary events, and every sequence flow as `source -> target [condition]`.
- **layout** — **non-destructive by default**: on a file that already has a
  diagram it preserves the layout (hand-tuned positions, Camunda multi-diagram
  sub-process pages) and only prunes shapes for deleted elements and places
  shapes for new ones. With no DI it generates a fresh layout. `--rebuild` forces
  a full re-layout from scratch. Covers collaborations (all pools + message
  flows), swimlanes, sub-process drill-down pages, and data objects/annotations.
  You author *semantics only* — never hand-write coordinates.
- **validate** — well-formed XML, every flow node/edge has a shape, no overlapping
  shapes (checked per diagram plane).
- **lint** — catches bugs that are valid XML but wrong behaviour: deadlock
  (parallel join after an exclusive split), double execution (exclusive join
  after a parallel split), stuck-token gateways (all branches conditioned, no
  default), unreachable nodes, dead ends, and a missing start/end event.
- **diff** — what changed between two versions: elements added/removed/renamed/
  retyped and sequence flows rewired.
- **find** — list flow elements whose name or type contains a term.

Run the test suite with `npm test`.

## How the skill is meant to be used

The full workflow, modeling conventions, and limits live in **`SKILL.md`**;
element-level XML recipes and edge cases in **`references/bpmn-reference.md`**.
The short version:

- **Reading:** `summarize` → explain the happy path, decisions, exceptions.
  For reviews, also `lint`.
- **Editing/creating:** edit semantics → `layout` → `validate` → `lint`.

## Known limits (auto-layout)

Layout covers single-pool flows, collaborations (all pools + message flows),
swimlanes, sub-process drill-down pages, and data objects/annotations/
associations. It does **not** auto-place **groups** (a group is a purely visual
rectangle with no membership in the model). Auto-placement of pools, lanes, data
objects, and annotations is approximate — valid and clean, but a user may want to
nudge spacing in a modeler. See `references/bpmn-reference.md`.

## Layout

```
bpmn/
├── SKILL.md                      # skill instructions (workflow, conventions, limits)
├── README.md                     # this file
├── package.json                  # bpmn-moddle + bpmn-auto-layout
├── scripts/
│   ├── bpmn-tool.mjs             # thin CLI: summarize / layout / validate / lint / diff / find
│   └── lib.mjs                   # all the mechanics (testable functions)
├── test/                         # node --test suite + fixtures (npm test)
└── references/bpmn-reference.md   # element cheat-sheet, recipes, pitfalls
```

## License

MIT © 2026 Artur Karapetyan. See the `LICENSE` file at the plugin root.
