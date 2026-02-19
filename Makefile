export HOST_UID := $(shell id -u)
export HOST_GID := $(shell id -g)

.PHONY: help claude-setup claude-run workspace ext-build ext-check ext-typecheck

.DEFAULT_GOAL := help

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

claude-setup: ## Setup Claude container
	./scripts/setup-claude-container.sh

claude-run: claude-setup ## Run Claude Code in Docker container
	docker compose run --rm claude-code

workspace: claude-run ## Alias for claude-run

ext-build: ## Build Chrome extension (TS → dist/)
	cd chrome-extension && npm run build

ext-check: ## Lint and format Chrome extension with Biome
	cd chrome-extension && npm run check

ext-typecheck: ## Type-check Chrome extension with TypeScript
	cd chrome-extension && npm run typecheck
