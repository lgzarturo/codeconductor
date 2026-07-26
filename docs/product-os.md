# Product Operating System

CodeConductor v1.0.0 treats the **product** as the central context — not
individual files, chats, or agent sessions.

## Concepts

| Concept | Artifact | Purpose |
| ------- | -------- | ------- |
| Product AST | `product-graph.json` | Typed graph of domains, capabilities, decisions, components |
| Episodic memory | `events.jsonl` | Append-only event log |
| Operational memory | `operational-state.json` | Active tasks, agents, blockers |
| Strategic memory | `strategic.json` | KPIs, quarterly focus, trade-offs |
| Semantic memory | graph + `memory.md` | Stable product knowledge |
| Decisions | `decisions/*.json` | Normalized ADRs and product decisions |
| Evidence | `evidence/*.json` | Verifiable proof of task completion |

## CLI Commands

```bash
# Ingest repo knowledge into product graph
npx cc-codeconductor ingest

# Explore product
npx cc-codeconductor product graph
npx cc-codeconductor product query "auth"
npx cc-codeconductor product path domain:core component:goal-planner
npx cc-codeconductor product timeline
npx cc-codeconductor product memory
npx cc-codeconductor product decisions
npx cc-codeconductor product insights

# Plan with product context
npx cc-codeconductor goal "Add payments" --product

# Orchestrate execution
npx cc-codeconductor orchestrate status
npx cc-codeconductor orchestrate next
npx cc-codeconductor orchestrate run --complete --task auth-impl
npx cc-codeconductor orchestrate cycle

# Impact analysis
npx cc-codeconductor impact --files src/core/goal/goal-planner.ts
npx cc-codeconductor impact --node component:goal-planner

# Verification
npx cc-codeconductor verify --task auth-impl
```

## Workflow

```text
Idea → ingest → product graph → goal --product → orchestrate next
  → agent executes → verify → orchestrate run --complete → feedback → insights
```

## Memory layers

1. **Operational** — what is running now (`operational-state.json`)
2. **Semantic** — what the product is (`product-graph.json`)
3. **Episodic** — what happened (`events.jsonl`)
4. **Procedural** — how work flows (AGENTS.md, routing policy)
5. **Strategic** — why and what to prioritize (`strategic.json`)

## Contracts

See `src/validation/schemas.ts` for Zod definitions:

- `CanonicalTaskCardSchema`
- `DecisionSchema`
- `EvidenceSchema`
- `KnowledgeEntitySchema`
- `ProductGraphSchema`
- `ProductEventSchema`

See [ADR-011](adr/adr-011-product-os-v1.md) for architecture decision record.
