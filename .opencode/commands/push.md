---
description: Push submodule and parent repo to remote
---

This project uses a git submodule at `themes/hugo-book/`. Pushing requires TWO steps in order.

First, check the current state:

!`git status`
!`git -C themes/hugo-book status`

Then execute the push in order:

1. **Push the submodule first** (branch `master`, remote `hugo-book`):
   ```
   cd themes/hugo-book && git push hugo-book master
   ```

2. **Then push the parent repo** (branch `main`, remote `origin`):
   ```
   git push origin main
   ```

If either push fails, report the error and do NOT proceed to the next step.
After both pushes succeed, run `git status` to confirm clean state.
