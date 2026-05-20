---
description: Edit an existing BPMN diagram, then re-layout, validate and lint
argument-hint: <file.bpmn> — <change to make>
---

Use the **bpmn** skill to edit a BPMN diagram. Input (file plus the requested
change): $ARGUMENTS

First `summarize` the file to understand it, apply the change to the semantics,
then run `layout` → `validate` → `lint`. Report what changed and the result. Note
that re-layout regenerates positions, so any manual placement is discarded — say
so if it mattered.
