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
- **Create / edit** processes from a description, then auto-generate a clean
  left-to-right layout (you never hand-write diagram coordinates).
- **Validate**: well-formed XML, every node/edge has a shape, no overlaps.
- **Lint control flow**: catches bugs that are valid XML but wrong behaviour —
  deadlock (parallel join after an exclusive split), double execution (exclusive
  join after a parallel split), and stuck-token gateways (all branches
  conditioned, no default).

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

## Usage

The skill is invoked automatically, but the bundled tool can also be run directly:

```bash
node skills/bpmn/scripts/bpmn-tool.mjs summarize <file.bpmn> [--json]
node skills/bpmn/scripts/bpmn-tool.mjs layout    <in.bpmn> [out.bpmn]
node skills/bpmn/scripts/bpmn-tool.mjs validate  <file.bpmn>
node skills/bpmn/scripts/bpmn-tool.mjs lint      <file.bpmn>
```

Full workflow, modeling conventions and limits are in
[`skills/bpmn/SKILL.md`](skills/bpmn/SKILL.md); element-level XML recipes in
[`skills/bpmn/references/bpmn-reference.md`](skills/bpmn/references/bpmn-reference.md).

## Known limits (auto-layout)

`bpmn-auto-layout` lays out single-pool processes well. It does **not** fully
lay out collaborations (only the first pool), expanded sub-processes (drawn
collapsed by design), groups, text annotations, associations, message flows, or
data objects. See the reference for workarounds.

## License

[MIT](LICENSE) © 2026 Artur Karapetyan
