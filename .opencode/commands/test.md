---
description: Run Playwright E2E tests and fix failures
---

Run the full Playwright test suite **inside the Docker container** so this session does not collide with other AI sessions on Hugo's port 1313:

!`make docker-test`

Analyze the results. If there are failures:

1. Read each failing test file to understand what is being tested
2. Read the source file(s) being tested to understand the current behavior
3. Determine whether the failure is a test bug or a source bug
4. Fix the issue and re-run the failing test file with `make docker-test ARGS="tests/<filename>.spec.ts"`
5. Once all individual fixes pass, run the full suite again with `make docker-test`

For a faster smoke check (~90s, ~5 specs) use `make docker-test ARGS="--project=pre-push"`.

**Never run `npx playwright test` or `npm test` directly on the host** — parallel agent sessions share Hugo's port 1313 and produce flaky results. Use the Docker targets instead. See `AGENTS.md` "Running Tests in Docker" for the full target list and per-worktree isolation details.

If the image is not built yet, run `make docker-build` once (one-time, ~20 min on first pull).

Key testing patterns for this project:
- Tests run WITHOUT Firebase auth. Settings modal tests are skipped.
- Tests use `window.dmPomodoro`, `window.dmKeyboardShortcuts`, `window.dmSounds`, and `window._rvTest` APIs
- Hugo base URL is `/digital-memory/` -- all `page.goto()` calls use relative paths like `'./'`
- Playwright strict mode is on -- use `.first()` or scoped selectors for multiple matches
- IDB seeding uses `dmSync.putTodo()` and raw IDB writes
