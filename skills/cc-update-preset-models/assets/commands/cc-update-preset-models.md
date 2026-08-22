---
description: >-
  [INTERNAL] Refresh src/presets/models agent slugs from live runner catalogs.
  Alias of /cc:update-preset-models.
---

# Update preset models

Scope: $ARGUMENTS

**INTERNAL ONLY.** Updates *this* repository's model maps. Never copy into
`presets/`. Do not run CCEP bootstrap.

## Instructions

1. Load and follow `skills/cc-update-preset-models/SKILL.md`.
2. Honor `.cursor/skills/cc-update-preset-models/SKILL.md` if present.
3. Use `$ARGUMENTS` as optional scope (one provider, one role, or empty = all).
4. Execute the plan: live docs, YAML, tests, CHANGELOG, verify. Do not stop at a plan unless the user asks for plan-only.

## Local verification

```bash
bun test test/model-config.test.ts test/prompt-v050.test.ts test/cursor-preset.test.ts
```
