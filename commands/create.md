---
description: Create a new BPMN 2.0 diagram from a text description
argument-hint: <process description>
---

Use the **bpmn** skill to model a new BPMN 2.0 diagram for: $ARGUMENTS

Pin down trigger, participants, happy path, decision points, exceptions, and end
states (ask only if something is genuinely unclear). Author the semantics, then
run the skill's `layout` → `validate` → `lint`. Save the result as a `.bpmn` file
(ask for the path/name if it wasn't given) and report where it is plus the
validation result.
