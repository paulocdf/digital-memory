---
name: firebase-deploy
description: Deploy Firestore and Storage security rules to Firebase using the service account key in the repo root
---

## What I do

Deploy Firebase security rules (Firestore and/or Storage) to the `digital-memory-0` project using the service account credentials file stored in the repo root.

## Prerequisites

Firebase CLI is used via `npx firebase-tools` (no global install required). If it's not cached yet, npx will download it automatically.

## Credentials

The service account key file lives in the **repo root** and matches the glob pattern `*-firebase-adminsdk-*.json`. This file is gitignored and must NEVER be committed, logged, displayed, or added to git staging.

**Before every deploy, verify the credentials file is gitignored:**

```bash
# Find the credentials file
ls *-firebase-adminsdk-*.json

# Verify it's ignored by git
git check-ignore *-firebase-adminsdk-*.json
```

If `git check-ignore` produces no output, STOP and fix `.gitignore` before proceeding.

## Deploy Commands

Set `GOOGLE_APPLICATION_CREDENTIALS` to authenticate without interactive login.

### Deploy Firestore rules only

```bash
GOOGLE_APPLICATION_CREDENTIALS=$(ls *-firebase-adminsdk-*.json) \
  npx firebase-tools deploy --only firestore:rules --project digital-memory-0
```

### Deploy Storage rules only

```bash
GOOGLE_APPLICATION_CREDENTIALS=$(ls *-firebase-adminsdk-*.json) \
  npx firebase-tools deploy --only storage:rules --project digital-memory-0
```

### Deploy both Firestore and Storage rules

```bash
GOOGLE_APPLICATION_CREDENTIALS=$(ls *-firebase-adminsdk-*.json) \
  npx firebase-tools deploy --only firestore:rules,storage:rules --project digital-memory-0
```

## Configuration Files

| File | Purpose |
|------|---------|
| `firebase.json` | Maps rule files to Firebase services (`firestore.rules`, etc.) |
| `.firebaserc` | Sets default project to `digital-memory-0` |
| `firestore.rules` | Firestore security rules source |
| `storage.rules` | Firebase Storage security rules source |

## Verification

After a successful deploy, the CLI outputs something like:

```
=== Deploying to 'digital-memory-0'...
...
+  firestore: released rules ...to cloud.firestore
+  Deploy complete!
```

If it fails with a permissions error, the service account key may have expired or lack the necessary IAM roles (`Firebase Rules Admin` or `Editor`).

## Critical Rules

1. **NEVER commit the credentials file** -- it is gitignored via `*-firebase-adminsdk-*.json` in `.gitignore`.
2. **NEVER log or display the file contents** -- do not `cat`, `read`, or print the JSON key file.
3. **NEVER add the file to git staging** -- do not run `git add` on it or use `git add -A` without verifying.
4. **Always verify gitignore** before deploying -- run `git check-ignore` as shown above.
5. **The project ID is `digital-memory-0`** -- always pass `--project digital-memory-0` explicitly.

## When to Use Me

Use this skill whenever you need to deploy updated Firestore or Storage security rules to Firebase. Common triggers:

- After modifying `firestore.rules` (e.g., adding a new collection, updating access rules)
- After modifying `storage.rules` (e.g., changing file size limits, content type restrictions)
- When the user asks to "deploy rules", "update Firebase", or "push rules to production"
