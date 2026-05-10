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

### 2. Copy the skills directory

```bash
cp -r presets/codex/skills /path/to/your/project/skills
```

Skills are referenced from `AGENTS.md` using relative paths. Keep them at the
project root under `skills/`.

## How to Use

Codex does not load custom slash commands from this preset. Use these natural
language trigger phrases:

| Workflow | Trigger phrase |
|----------|---------------|
| Full feature | `Run the feature workflow for: [description]` |
| Bug fix | `Run the fix workflow for: [description]` |
| Refactor | `Run the refactor workflow for: [scope]` |
| Code review | `Run a structured review of: [target]` |
| Test plan | `Create a test plan for: [scope]` |
| Task intake | `Help me define a Task Card for: [vague request]` |
| Codebase map | `Explore the codebase and produce a Repo Map` |

---

## Runtime Notes

- Codex uses `AGENTS.md` plus any installed `skills/*/SKILL.md` files.
- This preset does not provide separate runtime agent files or custom slash
  commands.
- For `context_scope: isolated` tasks, start a new Codex session before
  beginning the task.

---

## Compatibility

Skills in `skills/` declare Codex compatibility in frontmatter and are intended
to work across the supported presets.

The `AGENTS.md` and skill formats may evolve. Check current Codex
documentation if runtime behavior changes.
