# evals — regression & triggering test suite

Test assets for developing this skill further. They are **not** part of the
shipped plugin (`package_skill` excludes `evals/`), they live here so they're
versioned alongside the skill.

These LLM-graded evals test the *model's* behaviour. The script's own mechanics
are covered separately by a deterministic unit suite — run `npm test` in
`skills/bpmn/` (node `--test`, fixtures in `skills/bpmn/test/`).

## Files

- `evals.json` — 16 behavioural cases with assertions, each tagged with a
  `category`: **read** (1), **create** (4: simple, heavy, collaboration,
  swimlanes), **edit** (5: add, preserve-subprocess, rename-preserve, insert,
  delete-branch), **review** (3: deadlock, structure, collaboration), **utility**
  (2: diff, find), **validate** (1: fix broken layout).
- `files/` — input fixtures referenced by the cases (created/utility cases that
  produce output need no input):
  - `return.bpmn` — refund process (decision + 7-day timeout); read & delete-branch.
  - `order.bpmn` — simple order flow; add / rename / insert edits.
  - `approval-buggy.bpmn` — deliberate XOR-split / AND-join deadlock.
  - `hiring.bpmn` — Camunda-style multi-diagram export (sub-process with a
    drill-down page); "edit must not empty the sub-process".
  - `messy.bpmn` — unreachable node + dead end + implicit split (review-structure).
  - `collab-buggy.bpmn` — intra-pool message flow + boundary on a gateway.
  - `process-v1.bpmn` / `process-v2.bpmn` — as-is / to-be pair for `diff`.
  - `big-process.bpmn` — larger clean onboarding flow for `find`.
  - `broken-di.bpmn` — overlapping shapes; needs `layout --rebuild` to fix.
- `trigger-eval.json` — 30 should/shouldn't-trigger queries (16 yes, 14 no),
  including near-miss false triggers (JSON/git diff, code search, non-BPMN
  sequence diagrams) for optimizing the SKILL.md `description`.
- `check-fixtures.mjs` — deterministic pre-grader. Asserts the *input* fixtures
  exhibit what their cases assume (the deadlock deadlocks, broken-di fails
  validation, the diff pair yields the expected delta, …) using the skill's own
  tools, so a broken input is caught without an LLM run:
  ```bash
  node evals/check-fixtures.mjs   # needs `npm install` in skills/bpmn/
  ```

## How to re-run

With the [skill-creator](https://github.com/anthropics/claude-code) workflow:
spawn with-skill + baseline runs over `evals.json`, grade each output with the
skill's own `validate` + `lint` (and check element facts via `bpmn-moddle`),
then aggregate. For triggering, run the description optimizer over
`trigger-eval.json`.

Baseline note: a personal/installed copy of this skill auto-triggers in
subagents, which contaminates "without skill" baselines — temporarily move the
skill out of the skills path while running baselines.
