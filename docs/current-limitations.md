# Current Limitations

The canonical shipped/planned matrix is
[current-status.md](current-status.md). The published package version is
`1.4.2`, the current stable release in the `1.4.x` line.

## Workflow Runtime

The CLI and Product OS orchestrator commands are shipped in the published
`1.4.x` line. The separate 8-phase `runWorkflowPipeline` remains an
experimental library API, not a CLI runtime.

## Stack presets

Stack detection wires matching skills onto the generic target workflow. Full
stack-specific agent/command asset pruning and replacement is not implemented.

## LSP installation

Package-manager LSPs are supported. Kotlin binary installation is disabled
until each platform has a version-pinned HTTPS URL and verified SHA-256.

## Security

Policies are declarative and target-tool dependent.

Target presets do not expose identical enforcement surfaces. A policy rule may
be enforced in one target, documented in another, and unsupported in a third
until the policy compiler and target renderers exist.

## Agent Orchestration

CCEP and slash-command profiles define operational routing and confirmation
gates. Product OS goal orchestration is implemented-unreleased.

## Evaluation

Scorecards, outcome storage, aggregation, and regression commands are
implemented in the published CLI.

Harness ablation (`scorecard catalog|fingerprint|experiment|ablation`) is a
protocol runner: it materializes variants and compares tagged outcomes. It
does not invoke Cursor, Claude, or OpenCode. Combinatorial A/B and a CI
token-spend loop are out of scope.
