---
description: Read a BPMN 2.0 .bpmn file and explain it in plain language
argument-hint: <path/to/file.bpmn>
---

Use the **bpmn** skill to read and explain the BPMN diagram at: $ARGUMENTS

Run the skill's `summarize` on the file first (it is your source of truth — don't
eyeball raw DI), then explain the process in plain language: the happy path
first, then decision points (what each gateway branches on), parallel work, and
exception / boundary handling. Name real business steps, not element IDs, and
match the user's language. If this looks like a review ("is this correct?", "why
does it hang?"), also run `lint` and report any control-flow issues.
