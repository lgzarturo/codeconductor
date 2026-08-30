# OpenCode Preset for CodeConductor

## Model Selection Guide

This preset supports both **Claude (Anthropic)** and **OpenCode Go (Chinese
providers)** models.

---

## Model Reference

### Claude Models (Anthropic)

| Model                       | Strength                        | Best For                        |
| --------------------------- | ------------------------------- | ------------------------------- |
| `claude-opus-4-7`           | Complex reasoning, architecture | Architect, complex design       |
| `claude-sonnet-4-6`         | Balanced, general purpose       | Default for most agents         |
| `claude-haiku-4-5-20251001` | Fast, lightweight               | Task Coach, Docs, Repo Explorer |

### OpenCode Go models

Canonical slugs live in `src/presets/models/*.yml`. Production roles never use
`muse-spark-1.2-contributor` (trains on prompts). `ox-alpha-free` is an optional
fallback, not a default.

| Model | Best for |
| --- | --- |
| `deepseek-v4-pro` | Architect |
| `kimi-k3` | Security reviewer |
| `qwen3.8-max` | Reviewer, contract-builder |
| `glm-5.3` | Devil, complexity-auditor |
| `mimo-v2.5` | Implementer |
| `minimax-m3` | Tester |
| `qwen3.7-plus` | Orchestrator (TUI default) |
| `gpt-5.6-luna` | Task coach, planner |
| `deepseek-v4-flash` | Goal planner |
| `longcat-2.0` | Repo explorer |
| `hy3` | Docs |

---

## Agent Model Matrix

See `skills/cc-update-preset-models/references/role-map.md`. OpenCode column
examples: architect `deepseek-v4-pro`, implementer `mimo-v2.5`, tester
`minimax-m3`, reviewer `qwen3.8-max`.

---

## Agent Modes

| Agent             | Mode     | Description                                       |
| ----------------- | -------- | ------------------------------------------------- |
| **Orchestrator**  | primary  | Main coordinator — Tab to switch to it            |
| **Architect**     | subagent | Invoked by Orchestrator for design work           |
| **Implementer**   | subagent | Invoked by Orchestrator for code implementation   |
| **Tester**        | subagent | Invoked by Orchestrator for test generation       |
| **Reviewer**      | subagent | Invoked by Orchestrator for code review           |
| **Task Coach**    | subagent | Invoked by Orchestrator for intake clarification  |
| **Docs**          | subagent | Invoked by Orchestrator for documentation updates |
| **Repo Explorer** | subagent | Invoked by Orchestrator for codebase exploration  |

---

## Permission System

This preset uses OpenCode's permission system (v1.1.1+) with granular control:

- **Global defaults**: Most operations require approval (`ask`)
- **Read access**: Allowed by default, with sensitive files denied
- **Write/Edit**: Requires approval, with protected paths denied
- **Bash commands**: Read-only git commands allowed, destructive commands denied
- **Agent-specific**: Each agent has tailored permissions matching its role

### Protected Paths

The following paths are denied by default:

- `.env`, `.env.*` — environment secrets
- `secrets/**` — secret files
- `~/.ssh/**`, `~/.aws/**`, `~/.kube/**` — system credentials
- `.git/**`, `.opencode/**`, `.claude/**` — tool configuration

---

## Model Selection by Task Complexity

### Simple Tasks (Q&A, intake, documentation)

**Recommended:** `qwen3.6-plus` (OpenCode Go) or `claude-haiku-4-5-20251001`
(Claude)

- Task Coach intake
- Repo Explorer mapping
- Docs updates

### Medium Tasks (Implementation, testing)

**Recommended:** `mimo-v2.5` or `minimax-m3` (OpenCode Go) or
`claude-sonnet-4-6` (Claude)

- Implementer code writing
- Tester test generation
- Reviewer standard reviews

### Complex Tasks (Architecture, security, multi-agent coordination)

**Recommended:** `deepseek-v4-pro` (OpenCode Go) or `claude-opus-4-7` (Claude)

- Architect technical design
- Orchestrator routing decisions
- Reviewer security analysis

---

## Usage in Agent Contracts

Each agent file in `agents/` contains a model selection table in its
frontmatter:

```yaml
---
description: ...
# Model Selection
| Provider | Model | Use Case |
|----------|-------|----------|
| Claude | claude-opus-4-7 | Complex architecture, ADRs |
| OpenCode Go | deepseek-v4-pro | Best — excels at reasoning |
---
```

To override, edit the `model` field in the agent's YAML frontmatter or use the
configuration in `opencode.jsonc`.

---

## Configuration Priority

1. **Agent frontmatter** — highest priority (per-agent override)
2. **opencode.jsonc model override** — applies to specific agents
3. **opencode.jsonc default** — fallback for all agents

---

## Environment Variables

OpenCode Go requires appropriate API keys. Set these in your environment:

```bash
# DeepSeek
export DEEPSEEK_API_KEY="your-key"

# Qwen (Alibaba)
export DASHSCOPE_API_KEY="your-key"

# MiniMax
export MINIMAX_API_KEY="your-key"

# Kimi (Moonshot)
export KIMI_API_KEY="your-key"
```

---

## Selecting Between Claude and OpenCode Go

| Scenario                        | Recommended                                        |
| ------------------------------- | -------------------------------------------------- |
| Complex reasoning, architecture | OpenCode Go (`deepseek-v4-pro`) or Claude (`opus`) |
| Fast iteration, simple tasks    | OpenCode Go (`qwen3.6-plus`) or Claude (`haiku`)   |
| Code implementation             | OpenCode Go (`mimo-v2.5`) or Claude (`sonnet`) |
| Budget constraints              | OpenCode Go (generally lower cost)                 |
| Availability issues             | Switch to alternative from the matrix              |

## Approach

- Think before acting. Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read unless the file may have changed.
- Skip files over 100KB unless explicitly required.
- Suggest running /cost when a session is running long to monitor cache ratio.
- Recommend starting a new session when switching to an unrelated task.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.
- User instructions always override this file.
- When using tools, be precise and minimal with context.
{{LANGUAGE_INSTRUCTIONS}}

### YAGNI (You Aren't Gonna Need It)

Do not build features, abstractions, or "flexibility" that is not explicitly
requested. If the user asks for a function, write a function — not a class
hierarchy. If they ask for a string, return a string — not a Result type
with 15 error codes. Every line you write must solve a problem that exists
**now**.

### Stdlib-First

Prefer the language's standard library over third-party packages. Before
adding a dependency, ask: "Does `node:fs`, `node:path`, `node:crypto`, or
a built-in module solve this?" If yes, use it. Every external dependency
introduces maintenance burden, supply-chain risk, and version conflicts.

## Context Budget

- If the task type differs from the previous one, execute "/clear" before
  starting.
- Delegate verbose operations to sub-agents.
