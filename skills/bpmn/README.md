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
node scripts/bpmn-tool.mjs summarize <file.bpmn> [--json]   # structured outline, for explaining
node scripts/bpmn-tool.mjs layout    <in.bpmn> [out.bpmn]   # regenerate clean DI (layout)
node scripts/bpmn-tool.mjs validate  <file.bpmn>            # parse + missing-shape + overlap checks
node scripts/bpmn-tool.mjs lint      <file.bpmn>            # control-flow logic bugs
```

- **summarize** — pools/lanes, events, activities, gateways (with direction),
  boundary events, and every sequence flow as `source -> target [condition]`.
- **layout** — strips old DI and regenerates a tidy left-to-right diagram;
  collapses sub-processes to clean boxes. You author *semantics only* and let
  this produce the picture — never hand-write coordinates.
- **validate** — well-formed XML, every flow node/edge has a shape, no
  overlapping shapes.
- **lint** — catches bugs that are valid XML but wrong behaviour: deadlock
  (parallel join after an exclusive split), double execution (exclusive join
  after a parallel split), and stuck-token gateways (all branches conditioned,
  no default).

## How the skill is meant to be used

The full workflow, modeling conventions, and limits live in **`SKILL.md`**;
element-level XML recipes and edge cases in **`references/bpmn-reference.md`**.
The short version:

- **Reading:** `summarize` → explain the happy path, decisions, exceptions.
  For reviews, also `lint`.
- **Editing/creating:** edit semantics → `layout` → `validate` → `lint`.

## Known limits (auto-layout)

`bpmn-auto-layout` lays out single-pool processes well. It does **not** fully
lay out: collaborations (only the first pool), expanded sub-processes (rendered
collapsed by design), groups, text annotations, associations, message flows, and
data objects. See `references/bpmn-reference.md` for workarounds.

## Layout

```
bpmn/
├── SKILL.md                      # skill instructions (workflow, conventions, limits)
├── README.md                     # this file
├── package.json                  # bpmn-moddle + bpmn-auto-layout
├── scripts/bpmn-tool.mjs         # summarize / layout / validate / lint
└── references/bpmn-reference.md   # element cheat-sheet, recipes, pitfalls
```

## License

MIT © 2026 Artur Karapetyan. See the `LICENSE` file at the plugin root.
