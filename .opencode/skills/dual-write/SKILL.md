---
name: dual-write
description: The firestoreWrite() dual-write pattern for creating, updating, and deleting data with IDB-first optimistic writes and offline queue support
---

## What I do

Guide you through the correct dual-write pattern used in Digital Memory. Every data mutation MUST go through `window.dmSync.firestoreWrite()` -- never raw Firestore writes.

## The Pattern

### CREATE

```javascript
// 1. Generate an offline-compatible ID
var newDocId = window.dmDb
  ? window.dmDb.collection('collectionName').doc().id
  : ('local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));

// 2. Build the local object (IDB uses plain timestamps)
var localObj = {
  id: newDocId,
  userId: uid,
  /* your fields */
  createdAt: Date.now(),
  updatedAt: Date.now()
};

// 3. Dual-write: IDB first (optimistic), then Firestore
window.dmSync.firestoreWrite({
  collection: 'collectionName',
  docId: newDocId,
  op: 'set',
  data: {
    /* Firestore fields -- use serverTimestamp() for timestamps */
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  },
  localOp: function() { return window.dmSync.putXxx(localObj); }
});
```

### UPDATE

```javascript
window.dmSync.firestoreWrite({
  collection: 'collectionName',
  docId: obj.id,
  op: 'update',
  data: {
    fieldName: newValue,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  },
  localOp: function() {
    obj.fieldName = newValue;
    obj.updatedAt = Date.now();
    return window.dmSync.putXxx(obj);
  }
});
```

### DELETE

```javascript
window.dmSync.firestoreWrite({
  collection: 'collectionName',
  docId: objId,
  op: 'delete',
  data: null,
  localOp: function() { return window.dmSync.deleteXxx(objId); }
});
```

## Critical Rules

1. **NEVER bypass firestoreWrite()** -- it handles offline queueing, IDB-first writes, and error recovery.
2. **Firestore uses `serverTimestamp()`** for `createdAt`/`updatedAt` -- IDB uses `Date.now()`.
3. **`serverTimestamp()` sentinels corrupt in IDB** -- the `serializeQueueData()`/`deserializeQueueData()` helpers handle this. Never store raw sentinel objects in IDB.
4. **Firestore rejects `undefined`** -- always pass explicit `null` instead.
5. **`localOp` must return a Promise** (typically the IDB put/delete call).
6. **Soft delete pattern**: For notes/tasks, set `deletedAt: Date.now()` and `status: 'deleted'` instead of using `op: 'delete'`.

## When to Use Me

Use this skill whenever you need to create, update, or delete data in Digital Memory. This includes todos, notes, review cards, attachments, task shares, projects, and kanban columns.
