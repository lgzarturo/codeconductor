# ADR-011: Product Operating System v1.0.0

**Status:** accepted
**Date:** 2026-07-26

## Context

CodeConductor v0.5.0 orchestrates agents through versioned prompts and task
cards, but lacks a persistent, structured representation of the product itself.
Context lives in chat sessions, scattered markdown, and external tools (Engram,
graphify). The orchestrator delegates via prompts without executable state
management.

The market need is not faster code generation — it is converting business ideas
into maintainable products with traceability from requirements through
implementation to outcomes.

## Decision

Evolve CodeConductor v1.0.0 into a **Product Operating System** with:

1. **Product AST** — typed graph in `.codeconductor/product-graph.json`
2. **Layered memory** — episodic (`events.jsonl`), operational, strategic, semantic (graph)
3. **Knowledge ingestion** — `cc ingest` from repo sources (BACKLOG, ADRs, README, graphify)
4. **Executable orchestrator** — `cc orchestrate` manages goal DAG state and emits CCEP envelopes
5. **Impact engine** — `cc impact` previews blast radius before changes
6. **Verification layer** — `cc verify` gates task completion on evidence
7. **Feedback loop** — correlates outcomes and changelog with product graph

Persistence is **file-based only** (JSON/YAML/JSONL in `.codeconductor/`). No
database server. Agents execute externally; the OS manages state and artifacts.

Canonical contracts: `KnowledgeEntity`, `Decision`, `Evidence`, `CanonicalTaskCard`,
`ProductGraph`, `ProductEvent`.

## Consequences

**Easier:**

- Agents receive typed product context, not improvised prompts
- Decisions and evidence are versioned and traceable
- Goal execution survives session boundaries
- Product knowledge accumulates with each iteration

**Harder:**

- Ingestion quality depends on repo documentation discipline
- File-based graph may grow large; ingest uses hashing for incremental updates
- Orchestrator does not invoke LLMs — humans/runners still execute agents

**Constrains:**

- Web dashboard deferred; CLI is the product console for v1.0.0
- External analytics (GA4, Sentry) optional via `feedback-sources.yml`
- `ExecutionContext.ast.source` extended with `product-graph`
