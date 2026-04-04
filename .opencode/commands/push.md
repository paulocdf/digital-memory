---
description: Rebase onto main, run tests, and push to remote
---

> **Current workflow:** We commit directly to `main` (no PRs). Rebase the working branch onto `main` and fast-forward merge before pushing.

First, check the current state:

!`git status`
!`git -C themes/hugo-book status`

## 1. Run tests

!`npm test`

If tests fail, fix them before proceeding. Do NOT push broken code.

## 2. Rebase onto latest remote

```bash
# Parent repo
git fetch origin && git rebase origin/main

# Submodule (only if it has changes)
git -C themes/hugo-book fetch origin && git -C themes/hugo-book rebase origin/master
```

If rebase conflicts occur, resolve them and re-run tests.

## 3. Fast-forward merge into main

```bash
# Parent repo (replace <branch> with your current branch)
git checkout main && git merge --ff-only <branch>

# Submodule (only if it has changes)
git -C themes/hugo-book checkout master && git -C themes/hugo-book merge --ff-only <submodule-branch>
```

## 4. Push (submodule first if applicable)

If submodule has changes:
```bash
git -C themes/hugo-book push origin master
git add themes/hugo-book && git commit -m "update submodule pointer"
```

Then push parent:
```bash
git push origin main
```

If either push fails, report the error and do NOT proceed to the next step.
After pushing, run `git status` to confirm clean state.
