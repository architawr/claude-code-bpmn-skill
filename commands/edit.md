---
description: Edit an existing BPMN diagram, then re-layout, validate and lint
argument-hint: <file.bpmn> — <change to make>
---

Use the **bpmn** skill to edit a BPMN diagram. Input (file plus the requested
change): $ARGUMENTS

First `summarize` the file to understand it, apply the change to the semantics,
then run `layout` → `validate` → `lint`. Report what changed and the result.

`layout` is **non-destructive by default**: on a file that already has a diagram
it *preserves* the existing layout (including hand-tuned positions and Camunda
multi-diagram sub-process pages) and only syncs it to your edit — pruning shapes
for deleted elements and placing shapes for new ones. Only use `layout --rebuild`
when the user explicitly wants the whole diagram re-laid-out from scratch.
