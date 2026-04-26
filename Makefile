
all: run


# Default target to run
#.DEFAULT_GOAL := run

.PHONY: run
run:
	hugo server -D

# ---------------------------------------------------------------------------
# Docker targets — run tests and dev server inside containers.
#
# Multi-session safety: COMPOSE_PROJECT_NAME defaults to the worktree's
# basename, so each worktree gets its own Compose project (separate
# containers, networks, named volumes). Two AI sessions can run
# `make docker-test` at the same time without colliding.
# ---------------------------------------------------------------------------

COMPOSE_PROJECT_NAME ?= $(notdir $(CURDIR))
export COMPOSE_PROJECT_NAME

# Pass extra args to the test runner: `make docker-test ARGS="--project=ci"`
ARGS ?=

.PHONY: docker-build docker-test docker-test-ci docker-test-ui docker-shell docker-dev docker-down docker-clean

docker-build:
	docker compose build

docker-test:
	docker compose run --rm test npx playwright test $(ARGS)

docker-test-ci:
	docker compose run --rm test npx playwright test --project=ci $(ARGS)

# Playwright UI mode — exposes the UI server on a random host port.
# Run `docker compose ps` (or watch the logs) to see the actual port.
docker-test-ui:
	docker compose run --rm --service-ports test npx playwright test --ui --ui-host=0.0.0.0 --ui-port=8080 $(ARGS)

# Drop into a shell with hugo + node + npx playwright on PATH.
docker-shell:
	docker compose run --rm test bash

# Run the Hugo dev server inside the container, exposing it to the host on a
# random port (Docker assigns it; check `docker compose ps`). Bind to
# 0.0.0.0 so the host can reach it through the published port.
docker-dev:
	docker compose run --rm --service-ports test hugo server -D --bind 0.0.0.0 --port 1313 --baseURL http://localhost:1313/digital-memory/ --appendPort=false

# Stop and remove containers, networks, and named volumes for THIS worktree.
docker-down:
	docker compose down -v

# Nuke the image too (forces a full rebuild on next `make docker-build`).
docker-clean: docker-down
	docker image rm digital-memory-test:local 2>/dev/null || true
