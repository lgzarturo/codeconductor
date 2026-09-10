# CodeConductor Harness Spec (CCHS v1)

The contract every preset target (agy, claude, codex, cursor, gemini, opencode,
pi, and any future target) must satisfy to ship skills, slash commands, and
agent prompts through CodeConductor. It exists so a new target can be added by
declaring how it differs from this baseline, instead of re-deriving frontmatter
and invocation conventions from scratch.

This document describes what is enforced today and validated by tests. Where a
section describes something not yet implemented, it says so explicitly —
CCHS v1 is a live spec, not a changelog of a single migration.

## 1. Skill frontmatter

Enforced by `SkillFrontmatterSchema` (`src/validation/schemas.ts`) and
`parseSkillFrontmatter` (`src/core/presets/skill-frontmatter.ts`). Validated
for every shipped `SKILL.md` by `test/presets/frontmatter-parity.test.ts` and,
for a project's own installed skills, by `cc doctor`.

```yaml
---
name: python # required. kebab-case, matches the skill's directory name
description: >- # required, <=1024 chars. WHAT it does + WHEN to use it.
  Python development best practices: clean code, type hints, decorators.
  Use when writing or reviewing Python code anywhere in the project.
---
```

Two frontmatter shapes currently coexist and both validate:

- **Bare** — `{name, description}`. Used by most `cc-*` and `security-*`
  skills, where `name` is the kebab-case identifier.
- **Extended** — `{id, name, description, version, license, metadata, ...}`.
  Used by language/stack skills, where `name` is a human-readable title and
  `id` is the kebab-case identifier (`skillIdentifier()` returns `id` when
  present, `name` otherwise).

Extra fields are accepted (the schema is `.passthrough()`) but not required —
normalizing every skill onto one shape is a larger migration than this schema
exists to gate; see "Deferred" below.

**Description rule:** it should contain an explicit trigger — "Use when…" /
"Trigger:" / "when to use". A description that only states what the skill is
never auto-triggers on the model's own initiative. `hasTriggerLanguage()`
checks for this pattern; it is not yet a hard schema failure (many existing
skills predate the rule) but new skills should follow it.

## 2. Command frontmatter

Enforced by `CommandFrontmatterSchema` and `parseCommandFrontmatter`
(same two files as above). Validated for the 4 Markdown-based targets
(cursor, claude, opencode, agy) across every `WORKFLOW_COMMAND` by
`test/presets/slash-parity.test.ts`.

```yaml
---
description: Run the full feature workflow — task validation, design, implementation, tests, review, docs.
argument-hint: <feature description> # optional
allowed-tools: Read, Grep, Glob, Bash, Task # optional
model: sonnet # optional
disable-model-invocation: true # optional — true = user-invokable only
---
```

Only `description` is required today; every shipped command file currently
uses only that field. The other four are part of the standard and validate
when present — adding them to existing commands is an opt-in follow-up this
schema does not force.

Argument placeholder: `$ARGUMENTS` in the canonical Markdown source
(claude/cursor/opencode/agy). The generator (`scripts/render-agent-commands.ts`)
translates it to `{{args}}` for Gemini's TOML `prompt` field. Codex and Gemini
don't have their own YAML frontmatter fence — Codex commands ship as
`SKILL.md` (validated by the skill schema above) and Gemini commands ship as
`.toml` with a bare `description = "..."` key.

## 3. Cross-target invocation syntax

Three spellings exist for the same logical command, one per target family —
`formatCcCommand()` / `surfaceForRunner()` in
`src/core/presets/command-invocation.ts` is the single place that knows the
mapping:

| Family | Spelling | Targets |
| --- | --- | --- |
| Colon | `/cc:feature` | claude, cursor, gemini |
| Hyphen | `/cc-feature` | opencode, agy, pi |
| Dollar | `$cc-feature` | codex |

A command's own body must recommend *other* commands using its **own**
target's spelling — a Codex skill telling the user to run `/cc:review` points
at a command that doesn't exist on that runner. This is what
`test/presets/ask-parity.test.ts` and the "Next command spelling" checks in
`slash-parity.test.ts` guard against.

## 4. Target capability matrix

`src/presets/targets/<target>.yml`, one per target, validated by
`TargetCapabilitiesSchema` and loaded by `loadTargetCapabilities()`
(`src/core/presets/manifest-loader.ts`), checked by `cc doctor` and by
`test/unit/core/presets/target-capabilities.test.ts`:

```yaml
target: gemini
invocation: colon # colon | hyphen | dollar — must match surfaceForRunner()
commandFormat: toml # markdown | toml | skill
contextFile: GEMINI.md
subagentInvocationStyle: adopt-role # task-tool | adopt-role | invoke-with-context
capabilities:
  subagents: true
  hooks: false
  mcp: true
  council: true
```

`capabilities` describes what CodeConductor's **own preset** installs/manages
for that target, not the underlying tool's full native feature set — Cursor
supports MCP natively, for instance, but CodeConductor's cursor preset ships
no MCP config, so `mcp: false` here.

`subagentInvocationStyle` is the one field actually driving generation today:
`scripts/render-agent-commands.ts`'s `rewriteTaskToolInvocation()` uses it to
rewrite cursor's "Invoke the `X` subagent via the Task tool" phrasing —
accurate for Cursor and Claude Code, both of which have a Task tool — into
"Adopt the `X` role as defined in `<contextFile>`" for Gemini and Codex, which
don't. Left unrewritten, both derived targets told the model to use a tool
that doesn't exist for them (34 occurrences across 21 commands).

**What this matrix does not do**: drive a full single-source rewrite of
command *prose* across cursor/claude/opencode/agy. Diffing all 21 commands
across those 4 targets found real, deliberate content differences beyond
invocation style — Claude's `refactor` command has an entire extra
Blast Radius Assessment step (~135 lines) Cursor's doesn't; OpenCode's
"Invoke `X` with `<context>`" phrasing carries per-step context Cursor's
"via the Task tool" form doesn't state. Forcing these through one template
would either silently drop real content or require a conditional-block
templating language — out of scope here. Those 4 targets' command bodies
stay hand-maintained; the matrix's job is mechanical rewrites of boilerplate
(Task tool phrasing) and validation (catching a target that ships text
inconsistent with its own declared style), not merging genuinely divergent
authored content.

## 5. Versioning — planned, not yet implemented

Skill versioning currently lives in the extended frontmatter's `version`
field, which `update-checker.ts` still reads directly. The standing plan is a
repo-root `skills-registry.json` (sibling to `skills-lock.json`, which already
tracks third-party skill hashes) as the single source of version truth,
letting `version` (and `id`, which only duplicates `name`) drop out of
`SKILL.md` entirely. Deferred for now: it requires migrating all 384 shipped
`SKILL.md` files in the same pass, which is Fase 2 territory and carries its
own review risk independent of this spec.

## Adding a new target

1. Confirm its command format (Markdown+frontmatter, TOML, or something else)
   and pick the invocation spelling family from §3 — reuse an existing one
   unless the target genuinely can't.
1b. Add `src/presets/targets/<target>.yml` (§4) — this is what
    `render-agent-commands.ts` needs to know whether to rewrite Task-tool
    phrasing for it, and it's what `cc doctor` and
    `target-capabilities.test.ts` validate against.
2. Add a manifest under `src/presets/manifests/<target>.yml` following an
   existing one as a template.
3. If the target supports council, add a `<target>-council-generator.ts` +
   `<target>-installer.ts` under `src/adapters/<target>/` (see
   `agy-council-generator.ts` for the Markdown-shaped reference,
   `codex-council-generator.ts` for the TOML-shaped one) and wire it into the
   target switch in `src/commands/install.command.ts`.
4. Run `bun run render:commands` if the target derives its commands from the
   cursor source (see `scripts/render-agent-commands.ts`), then
   `bun run check:drift` to confirm the derivation is complete.
5. Add the target to `test/presets/slash-parity.test.ts`'s `TARGETS` array and
   to `RUNNER_TARGETS`/`INDIVIDUAL_TARGETS` in
   `src/core/runner/runner-target.ts`.
