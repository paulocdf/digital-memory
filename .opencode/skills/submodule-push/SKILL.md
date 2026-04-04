---
name: submodule-push
description: Full git lifecycle for Digital Memory — sync repos before starting work, rebase onto main and push when done
---

## What I do

Guide you through the full git lifecycle for Digital Memory: syncing repos before starting work, and rebasing onto `main` and pushing when done. This project uses a git submodule at `themes/hugo-book/` which requires a specific workflow.

> **Current workflow (no PRs):** We commit directly to `main`. This will change in the future when we adopt pull requests.

## IMPORTANT: Before starting work on a new task

**Before writing any code, you MUST ensure both repos are up to date with their remotes.** Starting from a stale branch causes unnecessary conflicts at push time.

```bash
# 1. Fetch and rebase parent repo onto latest main
git fetch origin && git rebase origin/main

# 2. Fetch and rebase submodule onto latest master
git -C themes/hugo-book fetch origin && git -C themes/hugo-book rebase origin/master
```

If the working tree has uncommitted changes from a previous task, commit or stash them first. If the rebase produces conflicts, resolve them before starting new work.

## IMPORTANT: When a task is complete

**When the user confirms the task is done, or says "push", "ship it", "we're done", or similar, you MUST execute the full workflow below.** Do NOT just edit files and tell the user the task is finished — the task is NOT finished until the changes are committed, rebased onto `main`, merged into `main`, and pushed to the remote. If the user has not explicitly asked to push yet, ask them if they'd like you to commit and push.

## Repository Layout

| Repo | Branch | Remote | Path |
|------|--------|--------|------|
| Parent (digital-memory) | `main` | `origin` | `/` |
| Submodule (hugo-book) | `master` | `origin` | `themes/hugo-book/` |

## Finish & Push Workflow

When the task is complete, **execute these steps in order**. Do not skip any step.

### Step 1: Commit all changes

Stage and commit all changes on the current working branch. Do not leave uncommitted work.

```bash
# Stage and commit (use a descriptive message)
git add -A && git commit -m "your message"

# Submodule (only if it has changes)
git -C themes/hugo-book add -A && git -C themes/hugo-book commit -m "your message"
```

### Step 2: Run tests

Run the full test suite before pushing. Do NOT skip this.

```bash
npm test
```

If tests fail, fix the failures before proceeding. Do not push broken code.

### Step 3: Rebase on latest remote

Fetch and rebase on the latest remote to keep history linear:

```bash
# Parent repo
git fetch origin && git rebase origin/main

# Submodule (only if it has changes)
git -C themes/hugo-book fetch origin && git -C themes/hugo-book rebase origin/master
```

If the rebase produces conflicts, resolve them and re-run tests before proceeding.

### Step 4: Fast-forward merge into main

Merge the rebased branch into `main` using fast-forward only. This ensures a linear history.

```bash
# Parent repo
git checkout main && git merge --ff-only <your-branch>

# Submodule (only if it has changes)
git -C themes/hugo-book checkout master && git -C themes/hugo-book merge --ff-only <submodule-branch>
```

If `--ff-only` fails, it means the rebase wasn't done correctly. Go back to Step 2.

### Step 5: Push the submodule (if it has changes)

```bash
git -C themes/hugo-book push origin master
```

Skip this step if there are no submodule changes.

### Step 6: Update the parent's submodule pointer (if submodule was pushed)

Back in the parent repo root:

```bash
git add themes/hugo-book
git commit -m "update submodule pointer"
```

### Step 7: Push the parent repo

```bash
git push origin main
```

## Critical Rules

1. **Always run tests before pushing** -- `npm test` must pass. Do not push broken code.
2. **Always rebase onto main before pushing** -- keeps history linear, avoids merge commits.
3. **Always fast-forward merge into main** -- `git merge --ff-only` ensures the rebase was correct. Never force a non-fast-forward merge.
4. **Always push submodule FIRST** -- if you push the parent first, CI will fail because the parent points to a submodule commit that doesn't exist on the remote yet.
5. **The parent repo tracks the submodule commit hash** -- after committing in the submodule, the parent shows `themes/hugo-book` as modified. You must `git add themes/hugo-book` and commit in the parent.
6. **CI/CD triggers on parent push** -- GitHub Actions runs Hugo build + Playwright tests + deploy to GitHub Pages.
7. **Submodule branch is `master`**, parent branch is `main` -- don't mix them up.
8. **Submodule remote is named `origin`** — verify with `git -C themes/hugo-book remote -v`.
9. **No PRs for now** -- commit directly to `main`. This will change in the future.

## Verification

After pushing:
```bash
git status                           # should be clean
git -C themes/hugo-book status       # should be clean
git log --oneline -1                 # verify parent commit is on main
git -C themes/hugo-book log --oneline -1  # verify submodule commit
```

## When to Use Me

Use this skill whenever you are done with a task and need to push changes. This includes:
- Changes inside `themes/hugo-book/` (requires the full submodule push flow)
- Changes only in the parent repo (skip submodule steps 4-5)
- Any time the user says "push", "ship it", "we're done", or similar
