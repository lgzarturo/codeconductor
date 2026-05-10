# Codex Preset for CodeConductor

This preset adapts the CodeConductor multi-agent workflow for **OpenAI Codex
CLI** — the terminal-based coding agent from OpenAI.

---

## What's Included

```
presets/codex/
├── AGENTS.md      # All 8 agent contracts + routing policy + hard rules
├── README.md      # This file
└── skills/        # Domain-specific knowledge files (11 skills)
    ├── api-versioning/SKILL.md
    ├── django-orm/SKILL.md
    ├── django-testing/SKILL.md
    ├── jpa-postgres/SKILL.md
    ├── python/SKILL.md
    ├── python-django-stack/SKILL.md
    ├── python-fastapi-stack/SKILL.md
    ├── spring-boot-feature/SKILL.md
    ├── spring-boot-kotlin/SKILL.md
    ├── sqlalchemy/SKILL.md
    └── testing-strategy/SKILL.md
```

---

## Installation

### 1. Copy AGENTS.md to your project root

```bash
cp presets/codex/AGENTS.md /path/to/your/project/AGENTS.md
```

If your project already has an `AGENTS.md`, merge the CodeConductor sections
into it. Keep a single authoritative `AGENTS.md` per directory scope.

### 2. Install skills in the layout that matches your project

**Codex-only project**

Copy the preset `skills/` directory into `.codex/`, or install only the
subdirectories relevant to your stack if you want a minimal setup.

```bash
cp -r presets/codex/skills /path/to/your/project/.codex/
```

**Codex + OpenCode combined project**

Do not duplicate skill files. Reuse the existing `.opencode/skills/`
installation and invoke skills from that path.

### 3. Follow the manual installation guide

Use
[docs/guides/manual-install-codex.md](../../docs/guides/manual-install-codex.md)
for the full installation flow, verification checklist, and first-task examples.

## How to Use

Codex does not load custom slash commands from this preset. Use these natural
language trigger phrases:

| Workflow     | Trigger phrase                                    |
| ------------ | ------------------------------------------------- |
| Full feature | `Run the feature workflow for: [description]`     |
| Bug fix      | `Run the fix workflow for: [description]`         |
| Refactor     | `Run the refactor workflow for: [scope]`          |
| Code review  | `Run a structured review of: [target]`            |
| Test plan    | `Create a test plan for: [scope]`                 |
| Task intake  | `Help me define a Task Card for: [vague request]` |
| Codebase map | `Explore the codebase and produce a Repo Map`     |

---

## Runtime Notes

- Codex uses `AGENTS.md` plus any installed skill files under
  `.codex/skills/*/SKILL.md` or `.opencode/skills/*/SKILL.md`.
- This preset does not provide separate runtime agent files or custom slash
  commands.
- For `context_scope: isolated` tasks, start a new Codex session before
  beginning the task.
- The workflow contract remains the same as the rest of CodeConductor: Task Card
  first, then risk classification, routing, implementation, verification, and
  human review.

---

## Compatibility

Skills in `presets/codex/skills/` declare Codex compatibility in frontmatter and
are intended to work across the supported presets. At install time they live in
`.codex/skills/` for Codex-only projects or remain in `.opencode/skills/` for
combined projects.

The `AGENTS.md` and skill formats may evolve. Check current Codex documentation
if runtime behavior changes.
