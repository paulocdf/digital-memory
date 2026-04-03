---
name: submodule-push
description: The 2-step git workflow for pushing theme changes in the hugo-book submodule and updating the parent repo pointer
---

## What I do

Guide you through the correct git push workflow for Digital Memory. This project uses a git submodule at `themes/hugo-book/` which requires a specific push order.

## Repository Layout

| Repo | Branch | Remote | Path |
|------|--------|--------|------|
| Parent (digital-memory) | `main` | `origin` | `/` |
| Submodule (hugo-book) | `master` | `hugo-book` | `themes/hugo-book/` |

## Push Workflow

### Step 0: Rebase on latest remote before committing

Always do this first, before making any commit, to keep history linear:

```bash
# Parent repo
git fetch origin && git rebase origin/main

# Submodule
git -C themes/hugo-book fetch origin && git -C themes/hugo-book rebase origin/master
```

If the rebase produces conflicts, resolve them before proceeding.

### Step 1: Commit in the submodule (if not already done)

```bash
cd themes/hugo-book
git add -A
git commit -m "your message"
```

### Step 2: Push the submodule

```bash
cd themes/hugo-book
git push origin master
```

### Step 3: Update the parent's submodule pointer

Back in the parent repo root:

```bash
git add themes/hugo-book
git commit -m "update submodule pointer"
```

### Step 4: Push the parent repo

```bash
git push origin main
```

## Critical Rules

1. **Always push submodule FIRST** -- if you push the parent first, CI will fail because the parent points to a submodule commit that doesn't exist on the remote yet.
2. **The parent repo tracks the submodule commit hash** -- after committing in the submodule, the parent shows `themes/hugo-book` as modified. You must `git add themes/hugo-book` and commit in the parent.
3. **CI/CD triggers on parent push** -- GitHub Actions runs Hugo build + Playwright tests + deploy to GitHub Pages.
4. **Submodule branch is `master`**, parent branch is `main` -- don't mix them up.
5. **Submodule remote is named `origin`** — verify with `git -C themes/hugo-book remote -v`.

## Verification

After both pushes:
```bash
git status                           # should be clean (or show only unrelated changes)
git -C themes/hugo-book status       # should be clean
git log --oneline -1                 # verify parent commit
git -C themes/hugo-book log --oneline -1  # verify submodule commit
```

## When to Use Me

Use this skill whenever you need to push changes that involve files inside `themes/hugo-book/`. If your changes are only in the parent repo (e.g., `content/`, `config.toml`, test files), you only need to push the parent.
