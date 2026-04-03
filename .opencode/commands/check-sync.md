---
description: Verify dm-sync serializers, IDB version, and Firestore rules are consistent
subtask: true
---

Audit the data layer for consistency. Check the following:

1. **`serializeTodo()` in `dm-sync.html`**: List all fields in the whitelist. Cross-reference with the TODO data model in `.context.md` and the `createTodo()` function. Report any fields that exist in `createTodo()` but are missing from `serializeTodo()`.

2. **`serializeNote()` in `dm-sync.html`**: Same check -- list all fields, cross-reference with the Note data model in `.context.md`.

3. **IDB version**: Check `DB_VERSION` in `dm-sync.html`. Verify it matches what `AGENTS.md`, `CONVENTIONS.md`, and `.context.md` say. Report any mismatches.

4. **IDB object stores**: Count the stores created in `onupgradeneeded`. Verify the count matches the docs.

5. **Firestore security rules**: Read `firestore.rules`. Check that every collection referenced in `dm-sync.html` has matching security rules. Report any collections without rules.

6. **Kanban columns**: Verify that `seedDefaultKanbanColumns()` uses deterministic IDs and has a concurrency guard.

Return a summary table of findings with pass/fail status for each check.
