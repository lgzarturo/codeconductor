# CodeConductor 1.6.1: Diagnosis and Improvements (Detection-Based Init, Workflows, Skills, Prompts, and Security)

For: Arturo L. Gómez · Date: Oct 9, 2026 · Repo: https://github.com/lgzarturo/codeconductor (commit `147fa3c`, tag `v1.6.1`, last push Oct 7, 2026 23:40 UTC-5)
Method: read-only clone at `/workspace/codeconductor-src`, code inspection, and searches with `git grep`. No pushes, PRs, issues, or comments made. Did not run test suite or install package. References use `file:line` format.

## 0. Findings That Come First

**Did not find any real exposed secrets.** Scanning yielded these matches:
- `test/credential-guard.test.ts:18-24` and `test/boundary-security.test.ts:16-18` contain tokens with realistic shapes (`ghp_…`, `github_pat_…`, `AKIA…`). The file itself states they are "Synthetic values with valid provider shapes. None are real credentials" (`test/credential-guard.test.ts:17`). There is no risk, but they trigger secret scanners (GitHub push protection, gitleaks). It is advisable to generate them at runtime (concatenating parts) or allowlist them.
- `src/core/filesystem/safety.ts:31` uses `AKIAIOSFODNN7EXAMPLE`, which is the official AWS documentation example. It is harmless.

**No CRITICAL findings** (neither exposed secrets nor remote RCE without interaction). The two **HIGH** severity findings that matter most are:
1. **Claude's default permission is equivalent to arbitrary execution.** `presets/claude/settings.json:43-44` allows `Bash(npx *)`, `Bash(python *)`, and `Bash(python3 *)`, and lines `:39-40` allow `pnpm exec *` and `pnpm dlx *`. With that, the `deny` list in `:65-120` is bypassed via `python -c "…"`. Furthermore, `:63` allows `WebFetch(*)`, and `:61` allows `Read(**)`. Together, these rules form the "read, execute, and exfiltrate" triad exploited by prompt injection.
2. **The installer overwrites project configuration and enables an unpinned third-party plugin.** `src/presets/manifests/claude.yml:7-10` copies `settings.json` with `strategy: overwrite` in project mode. That file enables the `AgriciDaniel/claude-seo` marketplace and plugin (`presets/claude/settings.json:173-200`) without a pinned commit, in any project, even if unrelated to SEO.

---

## 1. Diagnosis of 1.6.1

### 1.1 Architecture
- A TypeScript/Bun CLI compiled for Node ≥20.11 (`package.json:28-30,46-50`). The binary is called `cc-codeconductor` (or `codeconductor`). It has 29 commands (`src/commands/`) registered in `src/cli/command-registry.ts:17-49`.
- Has adapters for 8 targets: claude, codex, cursor, gemini, opencode, agy, pi, and muse (`src/adapters/*`, `src/presets/manifests/*.yml`). Each manifest lists `src → dest` entries with strategies `overwrite`, `merge-json`, or `merge-managed` (example: `src/presets/manifests/claude.yml`).
- The core is cleanly decoupled: `core/ccep` (workflow contracts, prompt compiler, risk classifier), `core/openspec`, `core/evaluation` (scorecards), `core/verification` (scope-guard, test-freeze, RDD receipts), `core/hooks`, `core/lsp`, and `core/install` (state with hashes).
- Uses 22 YAML workflows (`src/core/ccep/workflows/*.yml`): feature, fix, tdd-cycle, review, security, db-migration, openspec, etc. `init` copies them to `.codeconductor/workflows/`.
- **Real strengths**, worth preserving:
  - Installation state with sha256 per managed file (`src/core/install/installation-state.ts:29-56`), written atomically via tmp and rename (`:93-95`).
  - LSP binary downloads require HTTPS, pinned version, and sha256, and protect against zip-slip (`src/core/lsp/binary-integrity.ts:8-96`).
  - npm/pip packages without exact versions are rejected (`:30-45`).
  - User text is enclosed in "untrusted" fences with nested fence escaping (`src/core/shared/untrusted-text.ts:15-31`).
  - Subprocesses are spawned with tokenized `execFile`/`spawnSync`, never raw `exec(string)` (`src/core/evaluation/regression-checklist.ts:48`).
  - Context7 client uses `redirect: 'error'` and retrieves API key from the environment (`src/core/mcp/context7-bridge.ts:107-128`).
  - Multiplatform CI for hooks (`.github/workflows/ci.yml:10-23`).

### 1.2 Init and Detection
- `init` detects the stack (`src/commands/init.command.ts:35`), but **the result is only reported and drives no decisions**:
  - The target is hardcoded to `opencode` (`:56`, `:73`).
  - `resolvePresetsToCopy()` always copies `council.yml` and `policy.yml` (`:172-188`).
  - Always creates `BACKLOG.md`, OpenSpec state, evaluation, and 20+ workflows (`:117-120`).
- The resolver itself admits: *"stack-specific asset pruning is not implemented"* (`src/core/presets/preset-resolver.ts:62-64`). `resolveAssets()` depends solely on target, not stack (`:98-117`).
- Consequently, `install` for Claude copies all **61 skills** from `presets/claude/skills/` (940 KB) into any project (`src/presets/manifests/claude.yml`, entry `claude/skills → .claude/skills`, `overwrite`). That includes Laravel, Django, Android, and 20 `security-*` skills like `security-exploit-dev` and `security-malware-analysis`, which `src/presets/shared-skills.yml:6-30` mirrors across 5 targets.
- Limitations of the detector (`src/core/detection/project-detector.ts`):
  - Any `requirements.txt` counts as a Django signal (`detectors/backend.ts:18-30` + `project-detector.ts:68-74`), classifying a FastAPI or data project as "django".
  - Any `build.gradle(.kts)` is assumed to be Spring (`backend.ts:1-16`), so Android or Kotlin libraries also appear as "spring".
  - If Node is present, package manager is always `npm` (`project-detector.ts:47`). It does not check `pnpm-lock.yaml`, `yarn.lock`, or `bun.lock`.
  - Only inspects the root. Detects monorepos (`detectors/monorepo.ts`), but does not traverse sub-packages.
  - Does not detect CI (`.github/workflows`, GitLab), test frameworks, Docker, databases, or migrations.
- Dry-run exists (`init.command.ts:80-102`), but only lists what would be created without showing a diff of what would be overwritten.
- **No `uninstall` command exists**: does not appear in `command-registry.ts:17-49`, even though `install-state.json` contains the necessary data to implement it.

### 1.3 Workflows, Skills, and Prompts
- **Prompts are monolithic and duplicated.** `presets/codex/AGENTS.md` is 1093 lines, `presets/claude/CLAUDE.md` is 811, `presets/cursor/AGENTS.md` is 510, and `presets/agy/AGENTS.md` is 481, while gemini, pi, and muse hover around 45 lines. They encode the same rules with widely varying quality across targets. Files of 800-1100 lines load on every turn and drain context.
- The repo versions its own installed copies: 553 files in `.cursor/`, `.gemini/`, `.agents/`, `.pi/`, and `.agy/`, with `v0.2.0`, `v0.3.0`, `v0.4.0`, and `v1.0.0` prompts coexisting. Parallel maintenance is needed for `src/core/ccep/workflows` (22) and `.codeconductor/workflows` (20), though drift is checked by `check:drift`.
- Heavy command overhead. There are 23 per target (`presets/*/commands/cc`), and prompts repeat instructions such as "capture or verify the current RDD receipt with `npx cc-codeconductor rdd`" at every decision (`presets/claude/CLAUDE.md:807`, `presets/codex/AGENTS.md:1089`). For small tasks, the ceremony (council, scorecard, RDD, TDD capture) costs more tokens than the task itself.
- Uneven skill quality: some exceed 600 lines (`jpa-postgres` 623, `python` 611, `multi-agent-orchestration` 579, with example `.py` scripts). Third-party skills are only tracked in `skills-lock.json` (2 out of 61, both from `jeffallan/claude-skills`, with hashes).
- Claude's `settings.json` enforces personal preferences on every user: `language: spanish`, `editorMode: vim`, `model: sonnet`, attribution disabled, and `autoUpdatesChannel: latest` (`presets/claude/settings.json:14-19,181-197`).
- Public release drift: GitHub API reports *latest release* as `v1.2.0` (Sep 10, 2026), despite tags `v1.6.0` and `v1.6.1` existing (queried Oct 9, 2026). `release.sh:142-143` publishes manually with `git push` and `npm publish`, without creating a GitHub Release or using provenance.

---

## 2. Detection-Based Init: Proposed Design

### 2.1 Principles
1. **Detection → Plan → Confirmation → Application.** Never write without an explicit plan.
2. **Minimal by default.** Core (short CLAUDE.md or AGENTS.md, hooks, and 3-5 workflows) plus modules justified by detection. The rest is opt-in.
3. **Everything installed is recorded** with hash, source, and version, ensuring full reversibility.

### 2.2 Detector v2 (Replaces `project-detector.ts`)
Returns a `ProjectFacts` with evidence (file and rule) per fact and traverses monorepo packages:

| Dimension | Signals |
|---|---|
| Languages | Extensions counted via `git ls-files` (respects `.gitignore`) |
| Frameworks | Real dependencies: `package.json` (next, astro, react), `build.gradle.kts` (`org.springframework.boot`, `com.android.application`), `pyproject`/`requirements` (django, fastapi), `composer.json` (laravel/framework) |
| Package Managers | Lockfiles: `bun.lock`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `uv.lock`, `poetry.lock`, gradle wrapper, `composer.lock` |
| Monorepo | `pnpm-workspace.yaml`, `workspaces`, `settings.gradle(.kts)` with `include`, `go.work`, `Cargo [workspace]`, `nx.json`, `turbo.json`; package list with per-package stack |
| Tests | vitest/jest/bun test, JUnit/Kotest, pytest, PHPUnit/Pest; inferred test command (`./gradlew test`, `bun test`) |
| CI | `.github/workflows/*`, `.gitlab-ci.yml`; existing test/lint jobs |
| Data | Flyway/Liquibase, Prisma/Drizzle, Alembic, Django migrations |
| Public Web | `astro`/`next` + `public/robots.txt` → enables SEO/pagespeed |
| Present Agents | `.claude/`, `.cursor/`, `AGENTS.md`, `opencode.json`, `.codex/` → default target instead of fixed `opencode` |

Eliminates false positives: Django only if `manage.py` or `django` dependency exists; Spring only with the Spring Boot plugin.

### 2.3 Module Manifest
Each skill, workflow, command, or agent declares when it applies. Example in `skills/spring-boot-kotlin/module.yml`:
```yaml
id: skill.spring-boot-kotlin
kind: skill
version: 1.7.0
requires: { any: ["framework:spring-boot", "language:kotlin+gradle"] }
conflicts: []
targets: [claude, codex, cursor, opencode]
files: [SKILL.md]
risk: low          # low | elevated (security-offensive, db-write, network)
```
Skills `security-exploit-dev`, `malware-analysis`, `red-team`, `reverse-engineering`, `recon`, and `ot-ics` carry `risk: elevated` and **are never installed by detection**: only via `--with security-offensive`.

### 2.4 Profiles
- `minimal`: core plus detected stack skill and `fix`/`feature` workflow.
- `standard` (default): `minimal` plus `tdd-cycle`, `review`, and `openspec` if `openspec/` exists, and `db-migration` if migrations are present.
- `full`: mirrors current 1.6.1 behavior for backward compatibility.
- Stack profiles currently existing as seeds: `presets/spring-kotlin-jpa`, `ts-next-drizzle`, `python-data-api`, `laravel-tall`, and `seo-hotel`. These should become module compositions.

### 2.5 Project File `.codeconductor/conductor.yml` (Source of truth, committed to git)
```yaml
schema: 2
profile: standard
targets: [claude, codex]
detected: { stacks: [spring-boot, kotlin], pm: gradle, tests: junit5, ci: github-actions }
include: [skill.jpa-postgres]
exclude: [workflow.council]
lock: .codeconductor/conductor.lock.json   # hash + version + source per file
```

### 2.6 Commands and Semantics
- `cc init --detect --dry-run [--json]`: displays facts with evidence, selected modules with justification ("installed because `build.gradle.kts:3` applies `org.springframework.boot`"), files to create/modify/skip, and a unified diff of merges. Writes nothing. Exit code `0`, or `10` if changes are pending (useful in CI).
- `cc init --detect`: same output, prompts for interactive confirmation (or `--yes`), then applies.
- **Idempotence:** applies deterministically against `conductor.yml` and the lock. A second run with no changes produces zero writes. User-modified files (hash differs from lock) **are left untouched** and reported as `modified` (logic already exists in `getManagedFileStatus`).
- **Updates:** `cc update --plan` performs a three-way comparison (lock base, local, upstream) per module. Conflicts write `.cc-new` files instead of overwriting. `cc update --redetect` re-runs detection and suggests additions/removals.
- **Uninstallation:** `cc uninstall [--module X | --all] [--dry-run]` deletes only lock-tracked files whose hash matches. Modified files prompt or are retained. For `merge-json` and `merge-managed`, rolls back only managed keys or blocks (`<!-- cc:begin --> … <!-- cc:end -->`).
- **Global vs Project:** global mode never writes `settings.json` with `overwrite`, merging only its own keys.
- **Acceptance test:** one fixture per stack (Spring Kotlin, Bun+TS, Next, FastAPI, pnpm monorepo, Android) with plan snapshot, verifying "applying twice yields 0 changes".

---

## 3. Workflows, Skills, and Prompts vs the Ecosystem

Data verified against GitHub API on Oct 9, 2026 (UTC-5). Functional details come from `/workspace/skills-mvp-0-a-100-2026-10-08.md` (README reviews from Oct 8, 2026).

| Project | ★ | Latest Release | What to Adopt | What Not to Copy |
|---|---|---|---|---|
| obra/superpowers | 296,862 | v6.4.2 (Sep 25, 2026) | Small, composable skills; concise `SessionStart` bootstrap that **indexes** skills rather than inlining them; `verification-before-completion` and `systematic-debugging` | Custom brainstorming and planning that overrides OpenSpec; optional telemetry |
| Fission-AI/OpenSpec | 71,474 | v1.14.1 (Oct 5, 2026) | Delegate spec formatting to official CLI (`openspec`) instead of reimplementing in `core/openspec` (16 files) | — |
| gastownhall/beads | 27,772 | v1.3.1 (Sep 30, 2026) | Persistent task DAG with dependencies (`bd ready`) as a queue instead of `BACKLOG.md` plus `openspec-state.json` | Forcing it as mandatory; keep as optional module |
| openai/codex-plugin-cc | 34,018 | v1.0.6 (Jul 7, 2026) | Cross-model review (`/codex:adversarial-review --base main`) as a step in `review` workflow | Hard dependency: 3 months without commits |
| open-gsd/gsd-core | 10,340 | v1.16.0 (Oct 4, 2026) | Short `STATE.md` between sessions; subagent waves with clean context; runtime-prompting installer | Full monolithic loop replacing OpenSpec, Beads, and Superpowers |

Concrete improvements:
1. **Layered prompts (from 800-1100 lines down to under 150 fixed lines).** A core `AGENTS.md` shared across all 8 targets (hard rules: tests, scope, security, and how to request help), plus a one-line-per-skill index loaded on demand. Generated from a single source. Currently Codex has 1093 lines and Gemini has 44 for the same role.
2. **Risk-proportional ceremony.** `core/ccep/risk-classifier.ts` already exists; use it to guide workflow intensity: `trivial` → direct fix with tests; `normal` → tdd-cycle and review; `high` (data, auth, payments) → council, RDD, and human approval. Removes the blanket "RDD receipt at every decision" instruction.
3. **Fewer, clearer commands.** Reduce 23 `/cc-*` commands to ~8 visible ones (`/cc-plan`, `/cc-build`, `/cc-fix`, `/cc-review`, `/cc-ship`, `/cc-status`, `/cc-handoff`, `/cc-help`), keeping others as subcommands.
4. **Uniform skill format.** Frontmatter with action-oriented `description` (when to use), body under 200 lines, and `references/` for deep details (as done by `php-pro` and `laravel-specialist`). Skill length linting and activation tests via sample prompts.
5. **Verification before completion** (Superpowers style): a single `cc verify` gate running the detected test command and scope-guard, replacing scattered manual captures.
6. **Optional cross-model review** in `review.yml` (Codex or official `code-review` plugin).
7. **Memory:** replace `.codeconductor/events.jsonl`, `product-graph.json` (over 39,000 versioned lines), and `episodic-store` with a concise `STATE.md` plus an optional Engram or Beads module.

---

## 4. Security

| # | Sev. | Finding | Evidence | Fix |
|---|---|---|---|---|
| S1 | **High** | Allowlist permits arbitrary execution, bypassing denylist | `presets/claude/settings.json:39-40` (`pnpm exec *`, `pnpm dlx *`), `:43-44` (`npx *`, `python *`, `python3 *`), `:35` (`npm run *`), `:51` (`./gradlew *`) | Closed allowlist generated from detector (only detected test/lint command). Remove `npx *`, `python *`, `dlx`. Remainder defaults to `ask`. |
| S2 | **High** | Exfiltration triad under prompt injection | `settings.json:61` `Read(**)`, `:63` `WebFetch(*)`, `:43` `npx *` | Remove `WebFetch(*)` from allowlist (switch to `ask` or doc-domain allowlist). Document threat model. |
| S3 | **High** | `install` overwrites `.claude/settings.json` and enables unpinned third-party plugin | `src/presets/manifests/claude.yml:7-10` (`strategy: overwrite`); `settings.json:173-200` (`AgriciDaniel/claude-seo`, `enabledPlugins`) | Use `merge-json` in project mode as well. Third-party plugins strictly opt-in, per module, pinned by commit/tag. |
| S4 | **Med-High** | Hook fails open | `presets/shared/invoke-hook.cjs:86-95,130-134`: if CLI is missing or exits with code other than 2, terminates with `exit 0` (or `{"decision":"allow"}` in agy) | `failClosed` mode for `pre-tool` (configurable), prominent warning in `session-start` if guard is offline, and `cc doctor` verification. |
| S5 | **Med-High** | Hook executes target repo code | `invoke-hook.cjs:103-116`: if `src/cli/main.ts` or `dist/index.js` exists in target project, executes it as CodeConductor on **every** tool call | Resolve only `node_modules/cc-codeconductor` or absolute path stored in lock with verified hash. Dev path enabled only with explicit flag (`CC_DEV=1`). |
| S6 | **Medium** | Pre-tool denylist uses regex and is bypassable | `src/core/hooks/hook-runner.ts:104,157-164`: `rm -rf` only checked when followed by `*` or `/` (allows `rm -rf ./src`, `rm -r -f`); misses `bash -c`, `sh -c`, `$(…)`, `python -c`. `READ_LIKE` (`:78`) omits `grep`, `base64`, `xxd`, `node`, `python`, allowing `grep . .env` | Treat pre-tool as defense-in-depth, not a security boundary. Add `bash/sh/zsh -c`, substitutions, and common file readers. Root fix is strict allowlist (S1) and runtime sandboxing. |
| S7 | **Medium** | Supply chain: unpinned `npx cc-codeconductor` in prompts and hooks | `presets/claude/CLAUDE.md:807`, `presets/codex/AGENTS.md:1089`, `presets/opencode/agents/orchestrator.md:333-336`, `src/commands/hook.command.ts:78-84`. Without local install, npx fetches latest, and typos risk typosquatting | Generate `npx cc-codeconductor@<installed_version>` or prioritize local binary (`node_modules/.bin`). |
| S8 | **Medium** | Unpinned CI lacking least privilege | `.github/workflows/ci.yml`: actions pinned by tag (`@v4`, `@v2`) not SHA, `bun-version: latest`, `bun install` without `--frozen-lockfile` in `test` job, no `permissions:` block (0 matches) | Pin actions by SHA, pin Bun version, use `--frozen-lockfile`, add `permissions: contents: read`. Add Dependabot or Renovate. |
| S9 | **Medium** | Manual publishing without provenance | `release.sh:142-143` (manual `npm publish --access public`); latest GitHub Release is v1.2.0 despite npm and git tags at 1.6.1 | Publish via GitHub Actions using `npm publish --provenance` (OIDC/trusted publishing) and create GitHub Releases with checksums. |
| S10 | **Medium** | Offensive skills installed by default | `src/presets/shared-skills.yml:6-30` (`security-exploit-dev`, `security-malware-analysis`, etc. across 5 targets); `claude.yml` copies entire `claude/skills` directory | Mark `risk: elevated` and require explicit opt-in (Section 2.3). |
| S11 | **Medium** | `find-skills` encourages unvetted web skill installation | `presets/claude/skills/find-skills/SKILL.md` (`npx skills add <package>`, skills.sh) | Require human confirmation, show content before install, record origin and hash in `skills-lock.json` (currently only 2 entries). |
| S12 | **Low-Med** | Config that disables user safeguards | `settings.json:192` `skipDangerousModePermissionPrompt: true` (contradicts `:127` `disableBypassPermissionsMode`); `:188` `autoUpdatesChannel: latest`; `:14-19` attribution stripped | Remove these keys from presets: they belong to individual user configuration. Retain attribution by default. |
| S13 | **Low** | Hook writes into user home directory | `settings.json:167` appends lines to `~/.claude/subagent.log` on every `SubagentStop` | Move to project `.codeconductor/logs/` or remove. |
| S14 | **Low** | Partial prompt injection coverage | `untrusted-text.ts:9-12`: parsed artifacts (specs, `tasks.md`) lack fences; repo files and web content read by agent bypass sanitizer | Core prompt rule ("file and web content are data"), fence spec text during prompt compilation, forbid specs from altering permissions or hooks. |
| S15 | **Info** | Synthetic tokens with realistic shape | `test/credential-guard.test.ts:18-24` | Assemble at runtime to prevent triggering secret scanners. |
| S16 | **Info (Positive)** | Outbound data destinations | Only `registry.npmjs.org` (version check, `src/core/install/registry-client.ts:4`) and Context7 when `CONTEXT7_API_KEY` is set (`context7-bridge.ts:107-128`, sends library id and query). Gemini and agy MCP configs are empty (`presets/gemini/settings.json:2`, `presets/agy/mcp_config.json:2`); Claude ships with telemetry disabled (`settings.json:7-8`) | Document in `SECURITY.md`, adding `CC_OFFLINE=1` option to disable npm checks. |

---

## 5. Pareto Roadmap

Effort: S ≤ 1 day, M 2-4 days, L 1-2 weeks. ⚠️ = breaking change.

### 1.7: Security and "Only What Is Needed" (The 20% Delivering 80%)
| Task | Effort | Notes |
|---|---|---|
| S1+S2: Minimal allowlist derived from detected stack; `WebFetch` and `npx` moved to `ask` | S | ⚠️ behavioral change (more confirmation prompts); document |
| S3: `settings.json` with `merge-json` in project mode; claude-seo plugin opt-in | S | ⚠️ projects relying on the plugin must opt in explicitly |
| S4/S5: Hook resolving only installed binary, with optional fail-closed mode | S | |
| S7: Pin version in `npx cc-codeconductor@x.y.z` | S | |
| S8/S9: CI with SHA pins, permissions, and lockfile; release with provenance | S | |
| S10: Offensive `security-*` skills made opt-in | S | ⚠️ no longer installed by default |
| Detector v2 (lockfiles, real deps, tests, CI, no Django/Spring false positives) | M | |
| `init --detect --dry-run` with explanation and diff; default target matching existing agent folder | M | |
| `cc uninstall` based on `install-state.json` | M | |

### 1.8: Modules and Prompts
| Task | Effort | Notes |
|---|---|---|
| Manifest `module.yml` per skill, workflow, and command, plus minimal/standard/full profiles | L | `full` preserves 1.6 behavior |
| `conductor.yml` + `conductor.lock.json`; three-way `update --plan` and `--redetect` | M | |
| Monorepo: per-package detection and subfolder skill allocation | M | |
| Unified core prompt under 150 lines, generated across all 8 targets, with skill index | M | |
| Risk-based ceremony via `risk-classifier` | M | |
| Skill linter (length, frontmatter) and activation testing | S | |
| S6, S11-S14 | S-M | |

### 2.0: Simplification ⚠️
| Task | Effort | Notes |
|---|---|---|
| ⚠️ Consolidate to ~8 `/cc-*` commands with backward-compatible aliases for one minor version | M | |
| ⚠️ `install-state.json` v1 → lock v2 (includes `cc migrate`) | M | |
| ⚠️ Delegate specs to official OpenSpec CLI; optional Beads queue; retire versioned `product-graph.json` | L | |
| ⚠️ Remove `v0.x` prompts and repository's self-installed copies (553 files across `.cursor/.gemini/.agents/.pi/.agy`) | M | |
| Optional cross-model review (Codex or external model) in `review` workflow | S | |

---

## Sources
- Code: `lgzarturo/codeconductor` @ `147fa3c` (tag v1.6.1), inspected Oct 9, 2026.
- GitHub API (`/repos/{r}` and `/releases/latest`), Oct 9, 2026 ~16:00 UTC-5: obra/superpowers, Fission-AI/OpenSpec, gastownhall/beads, openai/codex-plugin-cc, open-gsd/gsd-core, lgzarturo/codeconductor.
- Context: `/workspace/skills-mvp-0-a-100-2026-10-08.md` (README reviews from Oct 8, 2026) and `/workspace/beads-graphify-engram.md`.
- Unverified: did not run `bun test` or test installations. S6 bypasses derived from static regex analysis, not active execution.
