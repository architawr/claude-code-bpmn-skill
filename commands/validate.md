---
description: Validate a BPMN file - structural checks plus control-flow lint
argument-hint: <path/to/file.bpmn>
---

Use the **bpmn** skill to validate the BPMN file at: $ARGUMENTS

Run `validate` (well-formed XML, every flow node/edge has a shape, no overlapping
shapes) and `lint` (deadlocks, double execution, stuck-token gateways). Summarize
the findings in plain language and propose concrete fixes. If the user asks,
apply the fixes and re-run both until clean.
