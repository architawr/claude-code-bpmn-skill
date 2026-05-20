# evals — regression & triggering test suite

Test assets for developing this skill further. They are **not** part of the
shipped plugin (`package_skill` excludes `evals/`), they live here so they're
versioned alongside the skill.

These LLM-graded evals test the *model's* behaviour. The script's own mechanics
are covered separately by a deterministic unit suite — run `npm test` in
`skills/bpmn/` (node `--test`, fixtures in `skills/bpmn/test/`).

## Files

- `evals.json` — task cases (read / create / edit / heavy create / edit while
  preserving a sub-process) with assertions. The behavioural regression suite.
- `files/` — input fixtures referenced by the eval cases:
  - `return.bpmn` — refund process (decision + 7-day timeout) for the read case.
  - `order.bpmn` — simple order flow for the edit case.
  - `approval-buggy.bpmn` — has a deliberate XOR-split / AND-join deadlock
    (`lint` should flag it).
  - `hiring.bpmn` — Camunda-style multi-diagram export with a sub-process that has
    its own drill-down page; for the "edit must not empty the sub-process" case.
- `trigger-eval.json` — 20 should/shouldn't-trigger queries for optimizing the
  SKILL.md `description`.

## How to re-run

With the [skill-creator](https://github.com/anthropics/claude-code) workflow:
spawn with-skill + baseline runs over `evals.json`, grade each output with the
skill's own `validate` + `lint` (and check element facts via `bpmn-moddle`),
then aggregate. For triggering, run the description optimizer over
`trigger-eval.json`.

Baseline note: a personal/installed copy of this skill auto-triggers in
subagents, which contaminates "without skill" baselines — temporarily move the
skill out of the skills path while running baselines.
