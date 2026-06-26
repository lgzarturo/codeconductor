.PHONY: help install build test typecheck dev run release-patch release-minor release-major clean

# Default target
all: help

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install project dependencies using Bun
	bun install

build: ## Build the project using Bun
	bun run build

test: ## Run the full test suite using Bun
	bun run test

typecheck: ## Check TypeScript types
	bun run typecheck

dev: ## Start the CLI tool in local development mode
	bun run dev

run: ## Run a local command via development CLI. Use ARGS="args", e.g., make run ARGS="doctor"
	bun run src/cli/main.ts $(ARGS)

release-patch: ## Bump patch version and prepare release (0.1.0 -> 0.1.1)
	./release.sh patch

release-minor: ## Bump minor version and prepare release (0.1.0 -> 0.2.0)
	./release.sh minor

release-major: ## Bump major version and prepare release (0.1.0 -> 1.0.0)
	./release.sh major

clean: ## Clean build directories and artifacts
	rm -rf dist
