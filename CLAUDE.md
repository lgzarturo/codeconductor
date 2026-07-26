# CodeConductor — Agent Configuration

## Behavioral Discipline

These guidelines reduce common LLM coding mistakes. They bias toward caution
over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

---

## YAGNI (You Aren't Gonna Need It)

Do not build features, abstractions, or "flexibility" that is not explicitly
requested. If the user asks for a function, write a function — not a class
hierarchy. If they ask for a string, return a string — not a Result type with 15
error codes. Every line you write must solve a problem that exists **now**.

## Stdlib-First

Prefer the language's standard library over third-party packages. Before adding
a dependency, ask: "Does `node:fs`, `node:path`, `node:crypto`, or a built-in
module solve this?" If yes, use it. Every external dependency introduces
maintenance burden, supply-chain risk, and version conflicts.

## Approach

- Think before acting. Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read unless the file may have changed.
- Skip files over 100KB unless explicitly required.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.
- User instructions always override this file.

## Context Budget

- If the task type differs from the previous one, execute "/clear" before
  starting.
- Delegate verbose operations to sub-agents.

## Local Development Execution Rule

Do NOT use `npx cc-codeconductor` for local testing. Use `bun run dev` instead
to test all current flow before publishing version v1.0.0 to npm.

| Production (`npx`)                       | Local development (`bun run dev`) |
| ---------------------------------------- | --------------------------------- |
| `npx cc-codeconductor seo audit --url …` | `bun run dev seo audit --url …`   |
| `npx cc-codeconductor goal "…"`          | `bun run dev goal "…"`            |
| `npx cc-codeconductor ccep parse …`      | `bun run dev ccep parse …`        |

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community
structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when
  graphify-out/graph.json exists.
- Use `graphify path "<A>" "<B>"` for relationships.
- Use `graphify explain "<concept>"` for focused concepts.
- If graphify-out/wiki/index.md exists, use it for broad navigation.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review.
- After modifying code, run `graphify update .` to keep the graph current.
