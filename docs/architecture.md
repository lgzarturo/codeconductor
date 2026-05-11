# Architecture

## Purpose

CodeConductor installs reproducible AI-assisted engineering workflows into
software projects.

It is not a prompt collection. In v0.1.x, it is a documentation-first preset
framework: teams manually install versioned agent contracts, routing rules,
skills, and policy templates into the repository.

The CLI configurator is planned. Once implemented, it will detect the stack,
resolve the matching preset, and write a structured, idempotent set of agent
contracts, routing rules, and skill definitions into the repository.

The output is commitable, reviewable, and reproducible — identical on any
machine, for any team member, across time.

---

## Core Pipeline

**Status:** Planned for the CLI runtime. Manual preset installation is the
implemented v0.1.x path.

```text
scan → classify → resolve preset → render → merge → validate
```

### 1. Scan

The Project Scanner reads the filesystem and extracts signals: file presence,
dependency keys, script names, and directory layout. No network calls. No LLM
invocations. Pure filesystem traversal.

### 2. Classify

The Stack Detector evaluates the collected signals against known patterns and
assigns a confidence score (0–1) per stack candidate. Higher-priority signals
(files > dependencies > scripts > structure) are weighted accordingly.

### 3. Resolve Preset

The Preset Resolver maps the classified stack to a registered preset. A preset
is a versioned collection of agent contracts, routing policy, commands, and
skills for a specific stack and target (e.g., `opencode/spring-boot-kotlin`).

### 4. Render

The Target Renderer processes the preset templates and produces a concrete file
plan: which files to create, where, and with what content. Variables are
substituted (project name, detected stack metadata, detected conventions).

### 5. Merge

The Safe Merger applies the rendered file plan to the project. Managed sections
(delimited by `CODECONDUCTOR:BEGIN` / `CODECONDUCTOR:END` markers) are
overwritten on update. Unmanaged content is preserved. No silent overwrites
outside managed sections.

### 6. Validate

The Doctor reads the installed configuration and verifies structural integrity:
required files present, managed sections intact, routing policy parseable, and
known commands registered.

---

## Core Components

### Project Scanner

**Status:** Planned for v0.2.0

Traverses the project directory and collects raw detection signals.

- Reads file presence (e.g., `build.gradle.kts`, `pom.xml`, `package.json`)
- Reads manifest content (dependencies, scripts, plugins)
- Reads directory structure (e.g., `src/main/kotlin`, `src/test`)
- Produces a signal map consumed by the Stack Detector

### Stack Detector

**Status:** Planned for v0.2.0

Evaluates signals and computes a confidence score for each known stack.

- Implements a common `Detector` interface: `detect(signals) → DetectionResult`
- Each detector is stack-specific (e.g., `SpringBootKotlinDetector`,
  `NextJsDetector`)
- Confidence model: score 0–1 per candidate
- Multiple detectors run in parallel; highest-confidence result wins

### Preset Resolver

**Status:** Planned for v0.2.0

Maps a detected stack to a registered preset.

- Reads the preset registry (file-based, no remote calls)
- Resolves the `target/stack` key to a preset path
- Falls back to the generic preset if confidence is below threshold

### Target Renderer

**Status:** Planned

Processes preset templates and produces a concrete file plan.

- Substitutes template variables with project-specific values
- Produces an ordered list of file operations (create, update managed section)
- Does not write to disk — produces a plan only

### Safe Merger

**Status:** Planned for v0.2.0

Applies the file plan to the project without clobbering user content.

- Identifies managed sections via `CODECONDUCTOR:BEGIN` / `CODECONDUCTOR:END`
  markers
- Replaces managed sections on update; leaves everything else untouched
- Detects conflicts: if a managed section was manually modified outside the
  marker boundaries, warns and aborts unless `--force` is passed
- Produces a write report: files created, files updated, files skipped

### Doctor

**Status:** Planned for v0.2.0

Validates the installed configuration.

- Checks that required files are present and non-empty
- Verifies managed section markers are intact (no corruption)
- Validates routing policy structure
- Reports: PASS, WARNING (degraded), or FAIL (broken)

---

## Targets

| Target   | Status                | Notes                                 |
| -------- | --------------------- | ------------------------------------- |
| OpenCode | Implemented in v0.1.0 | Manual preset support.                |
| Claude   | Implemented in v0.1.0 | Manual Claude Code-compatible preset. |
| Codex    | Implemented in v0.1.x | Manual Codex CLI-compatible preset.   |

Target-specific rendering means the same preset content is rendered differently
per target. Agent contracts that work for OpenCode's `AGENTS.md` format are not
the same as those for Claude Code's `CLAUDE.md` format.

Target rendering must also preserve the canonical security intent from
`policy.yml`. When a target cannot enforce a rule directly, the renderer should
emit an explicit compatibility warning rather than silently dropping the rule.

---

## CLI Internal Structure

Planned for v0.2.0. TypeScript, Node.js runtime, distributed via `npx`.

```text
packages/codeconductor-cli/src/
  commands/
    init.ts
    doctor.ts
    update.ts
  scanner/
    project-scanner.ts
    file-system.ts
    manifest-reader.ts
  detectors/
    detector.interface.ts
    spring-boot-kotlin.detector.ts
    nextjs.detector.ts
    fastapi.detector.ts
    python.detector.ts
  presets/
    preset-resolver.ts
    preset-registry.ts
  renderer/
    template-renderer.ts
    file-plan-renderer.ts
  merger/
    safe-merger.ts
    conflict-detector.ts
  validator/
    doctor.ts
    command-detector.ts
```

---

## Stack Detection Signals

Detection priority: `files > dependencies > scripts > structure > conventions`

| Signal File        | Stack Inferred                   |
| ------------------ | -------------------------------- |
| `build.gradle.kts` | Gradle + Kotlin                  |
| `pom.xml`          | Maven + Java/Kotlin              |
| `package.json`     | Node / TypeScript / React / Next |
| `pyproject.toml`   | Python (modern)                  |
| `requirements.txt` | Python (legacy)                  |
| `go.mod`           | Go                               |
| `Cargo.toml`       | Rust                             |

Spring Boot Kotlin strong signal composite: `build.gradle.kts` present AND
`src/main/kotlin` directory present AND `org.springframework.boot` in plugin
declarations AND `kotlin("plugin.spring")` in applied plugins.

---

## Detection Confidence Model

Each detector returns a score from 0 to 1 based on how many signals match and
their priority weight.

| Score Range | Behavior                                               |
| ----------- | ------------------------------------------------------ |
| >= 0.80     | Apply preset directly (no confirmation prompt)         |
| 0.50 – 0.79 | Prompt user for confirmation before applying           |
| < 0.50      | Apply generic preset; warn that stack was not detected |

The `--target` and `--stack` flags bypass detection entirely and apply the
specified preset at full confidence.

---

## Design Principles

**Deterministic detection first.** File presence and dependency keys are
evaluated before any heuristic or structural analysis. LLM enrichment is not
part of v0.1.0 detection.

**Explicit configuration.** Every installed file is committed to the repository.
There are no hidden or runtime-generated configurations.

**Idempotent installation.** Running `codeconductor init` on a project that
already has CodeConductor installed does not duplicate content. Managed sections
are updated in place.

**No silent overwrite.** Content outside managed section markers is never
modified. The Safe Merger aborts on conflict unless explicitly forced.

**Provider-agnostic core.** Detection, classification, and preset resolution are
provider-independent. Target rendering is the only provider-aware layer.

**Target-specific rendering.** The same preset produces different output for
OpenCode (`AGENTS.md`), Claude (`CLAUDE.md`), and future targets.

---

## Idempotency: Managed Section Markers

Files installed by CodeConductor contain delimited sections:

```text
<!-- CODECONDUCTOR:BEGIN managed -->
...generated content...
<!-- CODECONDUCTOR:END managed -->
```

On `codeconductor init` (first run), the full file is created.

On `codeconductor update`, only the content between markers is replaced. Any
content the user added outside the markers is preserved without modification.

This allows teams to extend installed files without losing their additions on
updates.

---

## Security

**Policy files.** **Status:** Implemented as declarative configuration.
`policy.yml` defines what each agent should be allowed to read, write, and
execute. CodeConductor does not enforce this file at runtime in v0.1.x.

**Policy Compiler.** **Status:** Planned. The policy compiler is not implemented
yet. Current policies are declarative and depend on target-tool support.

**Target security compatibility.** **Status:** Planned. Future renderers and
doctor checks must compare `policy.yml` against each target's actual permission
surface and report unsupported rules, permission drift, and role tool access
that exceeds the role contract.

**Isolated execution (planned).** In future versions, each agent session runs as
a dedicated low-privilege OS user (`cc-agent`) with no access to secrets,
credentials directories, or protected branches.

**Worktree per session (planned).** Each agent session operates in an isolated
Git worktree. The main working tree is not exposed during agent execution.

**Hard-denied commands.** **Status:** Documented and target-tool dependent.
`rm -rf`, `sudo`, `curl | sh`, force push, and reset on protected branches are
listed as denied policy rules. They are not independently enforced by
CodeConductor until the policy compiler and runtime enforcement exist.
