---
name: add-data-field
description: Checklist for adding a new Firestore/IDB field to todos, notes, or other collections without causing silent data loss
---

## What I do

Walk you through every step required to add a new data field to an existing collection. Missing any step causes silent data loss or sync failures.

## Checklist: Adding a Field to Todos

1. **Add to `createTodo()` in `dm-sync.html`**
   - Add the field with a sensible default value to the local object
   - Add it to the Firestore `data` object in the `firestoreWrite()` call

2. **Add to `serializeTodo()` in `dm-sync.html`** (CRITICAL)
   - This is a field whitelist that controls Firestore-to-IDB sync
   - If the field is NOT in `serializeTodo()`, it will be **silently dropped** every time `syncTodos()` runs
   - This is the #1 most common source of data loss bugs in this project

3. **Handle in `syncTodos()` merge logic** (if needed)
   - Check if the sync function properly copies the field when merging remote data into local IDB objects

4. **Update the edit UI** (if user-editable)
   - Add the field to `todo-edit-modal.html` (inline panel)
   - Wire up change handler to call `firestoreWrite()` with the new field

5. **Update `firestore.rules`** (if access control is needed)
   - Add write validation for the new field
   - Ensure security rules allow/disallow updates as appropriate

6. **Update documentation**
   - Add the field to the TODO data model in `.context.md`
   - If it changes a feature, update `FEATURES.md`
   - Update `AGENTS.md` if it affects the file map or line counts

## Checklist: Adding a Field to Notes

Same as todos, but:
- Add to `serializeNote()` instead of `serializeTodo()`
- Add to `createNote()` or handle in the note edit modal
- Update the Note data model in `.context.md`

## Checklist: Adding a New Object Store

1. **Increment `DB_VERSION`** in `dm-sync.html` (currently v14)
2. **Add store creation** in `onupgradeneeded` handler
3. **Add CRUD methods** (`putXxx`, `getXxx`, `getAllXxx`, `deleteXxx`)
4. **Add serializer function** if it needs Firestore sync
5. **Add sync function** if it syncs with Firestore
6. **Update `CONVENTIONS.md`** version history and object store list
7. **Update `.context.md`** with the new data model
8. **Update `AGENTS.md`** IDB version reference

## Common Pitfalls

- **Forgetting `serializeTodo()`** -- field works on first write but vanishes after next sync cycle
- **Using `undefined` instead of `null`** -- Firestore rejects `undefined` values
- **Not handling migration** -- existing documents won't have the new field; use `|| defaultValue` in read paths
- **Not updating security rules** -- field can be read but not written (or vice versa)

## When to Use Me

Use this skill whenever you need to add, rename, or remove a field from any data collection (todos, notes, reviewCards, projects, kanbanColumns, attachments, taskShares).
