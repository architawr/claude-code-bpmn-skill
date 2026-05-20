# bpmn — Claude Code plugin for BPMN 2.0

A [Claude Code](https://code.claude.com/docs) plugin that lets Claude work with
**BPMN 2.0** process diagrams (`.bpmn` XML): read and explain them in plain
language, and create or edit them so they come out **valid and visually clean**
in any modeler (Camunda Modeler, bpmn.io, Cawemo…).

The model does the semantic reasoning (what the process means, what to change);
a small bundled Node script does the deterministic mechanics — parsing,
regenerating layout, validating, and linting control flow.

## What it can do

- **Explain** a `.bpmn`: happy path, decision points, exception/timeout handling.
- **Create / edit** processes from a description (you never hand-write diagram
  coordinates), with full layout coverage: collaborations (all pools + message
  flows), swimlanes, sub-process drill-down pages, and data objects/annotations.
- **Edit non-destructively**: layout is **safe by default** — on a file that
  already has a diagram it preserves the layout (hand-tuned positions, Camunda
  multi-diagram sub-process pages) and only prunes shapes for deleted elements
  and places shapes for new ones. A full re-layout happens only with `--rebuild`.
- **Validate**: well-formed XML, every node/edge has a shape, no overlaps
  (checked per diagram plane).
- **Lint control flow**: catches bugs that are valid XML but wrong behaviour —
  deadlock (parallel join after an exclusive split), double execution (exclusive
  join after a parallel split), stuck-token gateways (all branches conditioned,
  no default), unreachable nodes, dead ends, and a missing start/end event.
- **Compare & search**: `diff` two versions (As-Is vs To-Be or edit review) and
  `find` elements by name or type.

## Requirements

- [Claude Code](https://code.claude.com/docs/en/quickstart)
- Node.js >= 18 and npm — on first use the skill runs `npm install` in its own
  folder to fetch `bpmn-moddle` and `bpmn-auto-layout` (deps are not committed).

## Install

This repository is both the plugin and a one-plugin marketplace:

```text
/plugin marketplace add architawr/claude-code-bpmn-skill
/plugin install bpmn@bpmn-tools
/reload-plugins
```

The skill is model-invoked: once installed, Claude uses it automatically when you
work with `.bpmn` files or ask to model/review a process. It is namespaced as
`bpmn` (the plugin name).

Or, for local development without installing:

```bash
claude --plugin-dir ./claude-code-bpmn-skill
```

## Commands

The skill is model-invoked automatically, but the plugin also adds explicit
slash commands (namespaced `/bpmn:`):

| Command | What it does |
|---|---|
| `/bpmn:explain <file.bpmn>` | Read a diagram and explain it in plain language |
| `/bpmn:create <description>` | Model a new diagram from a text description |
| `/bpmn:edit <file.bpmn> — <change>` | Apply a change, preserving the existing layout, then validate + lint |
| `/bpmn:validate <file.bpmn>` | Structural validation + control-flow lint, with fixes |
| `/bpmn:diff <old.bpmn> <new.bpmn>` | Compare two versions: added / removed / renamed / rewired |

## Usage

The skill is invoked automatically, but the bundled tool can also be run directly:

```bash
node skills/bpmn/scripts/bpmn-tool.mjs summarize <file.bpmn> [--json]
node skills/bpmn/scripts/bpmn-tool.mjs layout    <in.bpmn> [out.bpmn] [--rebuild]
node skills/bpmn/scripts/bpmn-tool.mjs validate  <file.bpmn>
node skills/bpmn/scripts/bpmn-tool.mjs lint      <file.bpmn>
node skills/bpmn/scripts/bpmn-tool.mjs diff      <a.bpmn> <b.bpmn>
node skills/bpmn/scripts/bpmn-tool.mjs find      <file.bpmn> <term>
```

Full workflow, modeling conventions and limits are in
[`skills/bpmn/SKILL.md`](skills/bpmn/SKILL.md); element-level XML recipes in
[`skills/bpmn/references/bpmn-reference.md`](skills/bpmn/references/bpmn-reference.md).

## Known limits (auto-layout)

Layout covers single-pool flows, collaborations (all pools + message flows),
swimlanes, sub-process drill-down pages, and data objects / annotations /
associations. It does **not** auto-place **groups** (a group is a purely visual
rectangle with no membership in the model). Auto-placement of pools, lanes, data
objects, and annotations is approximate — valid and clean, but a user may want to
nudge spacing in a modeler. See the reference for details.

## License

[MIT](LICENSE) © 2026 Artur Karapetyan
