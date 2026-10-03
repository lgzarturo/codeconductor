---
name: token-audit
description: >-
  Use when a workflow must prove its preset copies stopped wasting context:
  audit council duplication (C1), fallback sync (C2), and STOP/scope
  report-only counts (S1) with the official bytes/4 + bytes/% method.
---

# Token Audit — Duplication → Redirect → Measured Savings

Scope: $ARGUMENTS

Describe which workflow copies to audit. Include:

- The canonical source (council canonical:
  `presets/agy/workflows/cc-council.md`)
- The redirect targets to verify (the 5 council copies on
  codex/claude/cursor/opencode/gemini)
- The baseline in bytes (council baseline: 19327, about 19KB)

---

## Rules

### C1 — Council duplication

Every non-canonical council copy MUST be a minimal redirect stub:
a GENERATED header plus a pointer to the canonical copy, under
400 bytes each. A copy carrying the full Steps 0-5 body is a C1
violation. Stubs are produced ONLY by regenerating with
`inject-ccep-bootstrap.ts` + `render-agent-commands.ts` — never
by hand-editing the 5 copies.

### C2 — Fallback sync

`COUNCIL_FALLBACK_PROFILE` MUST be generated from
`src/core/ccep/workflows/council.yml`, never hand-synced. The
generated mirror lives at
`src/core/ccep/council-fallback.generated.ts` and is covered by
`bun run check:drift`: any drift between the YAML roster and the
fallback artifact fails the gate. A hardcoded fallback literal
in `profiles.ts` is a C2 violation.

### S1 — STOP/scope is report-only

Count STOP gates and scope mentions, report the count (for
example: 2 STOP gates across the 5 council phases), and never
block on it. S1 is report-only by design: no refactor, no gate
failure may follow from the count alone.

## Official method: bytes/4 + bytes/%

Tokens are estimated as bytes/4. Savings are reported in bytes
and in bytes/% against the baseline:

```
measured = sum of the 5 stub sizes in bytes
saved    = 19327 - measured
pct      = saved / 19327 * 100
tokens   ~= measured / 4
```

There is no cutoff threshold: always report the measured
numbers, even when the reduction is small.

## Gates

- `bun run check:council-redirect` — every council copy is a
  stub under 400 bytes pointing at the canonical file. Fails
  naming each offending copy; passes on a clean tree so work can
  proceed. Prints the measured total with bytes/% saved.
- `bun run check:drift` — regenerates the fallback artifact
  from `council.yml` plus all derived presets, then fails on any
  uncommitted diff.

## Regeneration (never manual)

```bash
bun run scripts/inject-ccep-bootstrap.ts
bun run scripts/render-agent-commands.ts
```

Both passes are idempotent: a second run changes zero bytes. If
`check:council-redirect` fails after a regeneration, the stub
format regressed — fix the generator, not the copies.

## Completion criteria

- [ ] 5/5 council copies are stubs (<400 bytes each, no full
  Steps body, GENERATED banner + canonical pointer).
- [ ] Fallback artifact matches `council.yml` and drift is
  clean.
- [ ] Savings reported in bytes and bytes/% vs the 19327
  baseline, with the S1 STOP/scope count attached.
