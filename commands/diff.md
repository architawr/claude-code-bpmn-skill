---
description: Compare two BPMN files - what was added, removed, renamed, rewired
argument-hint: <old.bpmn> <new.bpmn>
---

Use the **bpmn** skill to compare two BPMN files: $ARGUMENTS

Run `diff <a> <b>` to get the semantic + structural delta: flow elements added,
removed, renamed, or retyped, and sequence flows whose source/target changed.
Then explain the changes in plain business language - not raw IDs - grouped by
what they mean for the process (new steps, removed paths, rerouted flow,
relabeled activities). This is the tool for As-Is vs To-Be reviews and for
showing exactly what an edit changed.

If only one path is given, ask for the second file. The order is `old new`, so
"added" means present in the second file but not the first.
