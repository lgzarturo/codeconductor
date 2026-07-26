## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community
structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when
  graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for
  relationships and `graphify explain "<concept>"` for focused concepts. These
  return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw
  grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of
  raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when
  query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current
  (AST-only, no API cost).

## Local Development Execution Rule

Do NOT use `npx cc-codeconductor` for local testing. Use `bun run dev` instead
to test all current flow before publishing version v1.0.0 to npm.

| Production (`npx`)                       | Local development (`bun run dev`) |
| ---------------------------------------- | --------------------------------- |
| `npx cc-codeconductor seo audit --url …` | `bun run dev seo audit --url …`   |
| `npx cc-codeconductor goal "…"`          | `bun run dev goal "…"`            |
| `npx cc-codeconductor ccep parse …`      | `bun run dev ccep parse …`        |
