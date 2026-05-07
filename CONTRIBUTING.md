# Contributing to CodeConductor

CodeConductor is a structured workflow framework, not a prompt collection. Every
contribution must reinforce that distinction.

---

## Before You Start

Read [`docs/philosophy.md`](docs/philosophy.md) before contributing anything.

If you do not understand the difference between a **Task Card** and a prompt,
between an **Agent Contract** and a system message, or between a **Routing
Policy** and a conditional — stop and read it first.

Contributions that treat this as a prompt collection will not be merged.

---

## What We Accept

- New Conductor Agent definitions (with contract, permissions, and scorecard
  criteria)
- New stack detectors (with deterministic signal model and confidence scoring)
- New presets (OpenCode, Claude, Codex — following the renderer contract)
- New skills (with declared inputs, outputs, risk level, and compatibility)
- New commands (with frontmatter, argument spec, and example)
- Documentation improvements
- Bug fixes in existing agents, commands, or routing logic
- Real end-to-end examples (must use the Task Card → Route → Agent → Deliverable
  flow)

---

## What We Do Not Accept

- Raw prompt files without structure or contract
- Agents that do not declare their permissions and risk level
- Skills without a manifest (`SKILL.md` with `id`, `version`, `compatibility`,
  `risk`)
- Multi-provider abstractions before the target is proven to work
- Features for hypothetical use cases not yet validated in a real project

---

## Terminology

Always use CodeConductor's own vocabulary:

| Concept            | Correct term    | Wrong               |
| ------------------ | --------------- | ------------------- |
| Structured request | Task Card       | prompt, ticket      |
| Flow decision      | Route           | branch, condition   |
| Specialized agent  | Conductor Agent | bot, assistant, LLM |
| Decision rules     | Routing Policy  | if/else, logic      |
| Versioned prompts  | Agent Contracts | system prompts      |
| Reusable knowledge | Skills          | plugins, modules    |
| Evaluable output   | Deliverable     | result, output      |
| Agent metrics      | Scorecard       | evaluation          |

Using "prompt" where "Agent Contract" applies will be flagged in review.

---

## Process

### 1. Open an issue first

Describe what you want to add and why. This avoids wasted effort on things that
do not fit the roadmap.

Labels:

- `[core]` — framework structure, pipeline, contracts
- `[agents]` — Conductor Agent definitions
- `[skills]` — skill manifests and content
- `[commands]` — command templates
- `[docs]` — documentation
- `[presets]` — target-specific configuration (opencode, claude, codex)
- `[examples]` — end-to-end workflow examples
- `[meta]` — scorecard, changelog, versioning

### 2. Fork and branch

```bash
git checkout -b feat/your-feature-name
```

### 3. Make your changes

Follow the file structure in [`CLAUDE.md`](CLAUDE.md) and the agent contracts in
[`presets/`](presets/).

### 4. Test manually

Before submitting, verify your contribution works in a real project. Do not
submit untested agent definitions or detectors.

### 5. Open a pull request

Use the PR template. Include:

- What changed and why
- Which part of the roadmap it addresses
- How it was tested (real project, dry-run output, etc.)

---

## Agent Contract Requirements

Any new Conductor Agent must include:

- `id` — unique identifier
- `version` — semantic version
- `role` — one sentence describing what the agent does
- `permissions` — read, edit, bash, network (explicit allow/ask/deny)
- `risk_profile` — low / medium / high
- `use_when` — conditions that trigger routing to this agent
- `do_not_use_when` — explicit exclusions
- `deliverable` — what it must produce
- `scorecard_criteria` — at least 3 measurable quality criteria

---

## Skill Manifest Requirements

Any new skill must include a `SKILL.md` with:

```yaml
id: <unique-id>
version: <semver>
name: <display name>
description: <one sentence>

compatibility:
  tools: [claude, codex, opencode]
  stacks:
    languages: [...]
    frameworks: [...]

risk:
  level: low | medium | high
  can_execute_shell: true | false
  can_modify_files: true | false
  requires_network: true | false

inputs: [...]
outputs: [...]
```

---

## Commit Style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(agents): add security-reviewer agent contract
fix(routing): correct risk threshold for database migrations
docs(philosophy): clarify agent specialization principle
chore(presets): update spring-boot-kotlin opencode.jsonc
```

---

## Code of Conduct

Be direct. Be technical. Be constructive.

Criticism of ideas is expected and welcome. Criticism of people is not.

---

## Questions

Open an issue with the label `[question]`.
