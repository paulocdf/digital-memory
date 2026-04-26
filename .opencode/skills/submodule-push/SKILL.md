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

**When the user confirms the task is done, or says "push", "ship it", "we're done", or similar, you MUST execute the full workflow below.** Do NOT just edit files and tell the user the task is finished — the task is NOT finished until the changes are squashed into a single commit, rebased onto `main`, merged into `main`, and pushed to the remote. If the user has not explicitly asked to push yet, ask them if they'd like you to commit and push.

## Commit Message Conventions

All commit messages **must** follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body — explain the WHY, not the what]
```

**Rules:**
- Summary is **imperative mood**, **lowercase**, **no period** at end
- First line max **72 characters**
- Body (optional) explains motivation and context, separated by a blank line

**Types:**

| Type | When to use |
|------|-------------|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `refactor` | Code restructure with no behavior change |
| `style` | CSS/SCSS changes only |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Tooling, config, build, dependencies |
| `docs` | Documentation only |

**Scope** (optional but recommended): the component or area affected — e.g., `pomodoro`, `ai`, `kanban`, `sync`, `notes`, `auth`, `projects`, `review`, `export`

**Examples:**
```
feat(pomodoro): add resizable column split in focus mode
fix(sync): prevent race condition when switching tasks
refactor(ai): extract provider abstraction into helper functions
style(kanban): fix drag ghost placeholder alignment
feat(notes): add wikilink autocomplete in editor
fix(auth): handle popup-blocked redirect fallback on Safari
chore: update submodule pointer
```

## Repository Layout

| Repo | Branch | Remote | Path |
|------|--------|--------|------|
| Parent (digital-memory) | `main` | `origin` | `/` |
| Submodule (hugo-book) | `master` | `origin` | `themes/hugo-book/` |

## Finish & Push Workflow

When the task is complete, **execute these steps in order**. Do not skip any step.

### Step 1: Stage all changes (do NOT commit yet)

Stage everything in both repos. The final single commit is created in Step 4 after rebasing.

```bash
# Parent repo
git add -A

# Submodule (only if it has changes)
git -C themes/hugo-book add -A
```

> If you already made interim commits during development, that is fine — Step 4 will squash them all.

### Step 2: Run tests

Run the full test suite before pushing. Do NOT skip this.

Use the Docker target so this session does not collide with other parallel agent sessions on Hugo's port 1313:

```bash
make docker-test
# or, for a faster ~90s smoke check:
make docker-test ARGS="--project=pre-push"
```

If the image is not built yet, run `make docker-build` once first (~20 min on first pull).

**Never run `npx playwright test` or `npm test` directly on the host** from an agent session — parallel sessions share Hugo's port 1313 and produce flaky results. See `AGENTS.md` "Running Tests in Docker" for details.

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

### Step 4: Squash into a single commit

All work for a task must land on `main` as **one commit**. This keeps `git log` clean and makes revert/bisect trivial.

Use `git reset --soft` to collapse everything since the branch point into a single staged snapshot, then commit once with a well-formed conventional commit message:

```bash
# Parent repo — squash all commits on this branch into one
git reset --soft origin/main
git commit -m "feat(scope): short imperative summary"

# Submodule (only if it has changes)
git -C themes/hugo-book reset --soft origin/master
git -C themes/hugo-book commit -m "feat(scope): short imperative summary"
```

Craft the message following the **Commit Message Conventions** section above. If the body is needed, use:

```bash
git commit -m "feat(scope): short summary" -m "Longer explanation of why this change was made."
```

> **Why `reset --soft` instead of `rebase -i`?** `reset --soft origin/main` is non-interactive, agent-friendly, and produces the exact same result — a single commit on top of `main`.

### Step 5: Fast-forward merge into main

Merge the squashed commit into `main` using fast-forward only. This ensures a linear history.

```bash
# Parent repo
git checkout main && git merge --ff-only <your-branch>

# Submodule (only if it has changes)
git -C themes/hugo-book checkout master && git -C themes/hugo-book merge --ff-only <submodule-branch>
```

If `--ff-only` fails, it means the rebase in Step 3 wasn't done correctly. Go back to Step 3.

### Step 6: Push the submodule (if it has changes)

```bash
git -C themes/hugo-book push origin master
```

Skip this step if there are no submodule changes.

### Step 7: Update the parent's submodule pointer (if submodule was pushed)

Back in the parent repo root:

```bash
git add themes/hugo-book
git commit -m "chore: update submodule pointer"
```

### Step 8: Push the parent repo

```bash
git push origin main
```

## Critical Rules

1. **Always run tests before pushing** — `make docker-test` must pass. Do not push broken code. Agents must use the Docker target (not host `npm test`) so parallel sessions don't collide.
2. **Always rebase onto main before pushing** — keeps history linear, avoids merge commits.
3. **Always squash to a single commit per task** — use `git reset --soft origin/main` before committing. One task = one commit on `main`.
4. **Always use Conventional Commits format** — `type(scope): summary` in imperative mood, lowercase, max 72 chars.
5. **Always fast-forward merge into main** — `git merge --ff-only` ensures the squash + rebase was correct. Never force a non-fast-forward merge.
6. **Always push submodule FIRST** — if you push the parent first, CI will fail because the parent points to a submodule commit that doesn't exist on the remote yet.
7. **The parent repo tracks the submodule commit hash** — after committing in the submodule, the parent shows `themes/hugo-book` as modified. You must `git add themes/hugo-book` and commit in the parent.
8. **CI/CD triggers on parent push** — GitHub Actions runs Hugo build + Playwright tests + deploy to GitHub Pages.
9. **Submodule branch is `master`**, parent branch is `main` — don't mix them up.
10. **Submodule remote is named `origin`** — verify with `git -C themes/hugo-book remote -v`.
11. **No PRs for now** — commit directly to `main`. This will change in the future.

## Verification

After pushing:
```bash
git status                                # should be clean
git -C themes/hugo-book status            # should be clean
git log --oneline -3                      # verify single clean commit on main
git -C themes/hugo-book log --oneline -1  # verify submodule commit
```

## When to Use Me

Use this skill whenever you are done with a task and need to push changes. This includes:
- Changes inside `themes/hugo-book/` (requires the full submodule push flow)
- Changes only in the parent repo (skip submodule steps 6-7)
- Any time the user says "push", "ship it", "we're done", or similar
