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

### OpenCode Go Models (Chinese Providers)

| Model             | Provider        | Strength                         | Best For                   |
| ----------------- | --------------- | -------------------------------- | -------------------------- |
| `deepseek-v4-pro` | DeepSeek        | Reasoning complejo, arquitectura | Architect, orchestrator    |
| `mimo-v2.5-pro`   | MiniMax         | Razonamiento matemático, código  | Implementer                |
| `minimax-m2.7`    | MiniMax         | Tareas equilibradas              | Tester, orchestrator       |
| `qwen3.6-plus`    | Qwen            | Rápido, eficiente                | Reviewer, Task Coach, Docs |
| `kimi-k2-6`       | Kimi (Moonshot) | Conversación natural             | Task Coach, Docs           |

---

## Agent Model Matrix

| Agent             | Claude (Default)            | OpenCode Go (Recommended) | Alternative       |
| ----------------- | --------------------------- | ------------------------- | ----------------- |
| **Orchestrator**  | `claude-sonnet-4-6`         | `deepseek-v4-pro`         | `minimax-m2.7`    |
| **Architect**     | `claude-opus-4-7`           | `deepseek-v4-pro`         | `mimo-v2.5-pro`   |
| **Implementer**   | `claude-sonnet-4-6`         | `mimo-v2.5-pro`           | `minimax-m2.7`    |
| **Tester**        | `claude-sonnet-4-6`         | `minimax-m2.7`            | `deepseek-v4-pro` |
| **Reviewer**      | `claude-sonnet-4-6`         | `qwen3.6-plus`            | `minimax-m2.7`    |
| **Task Coach**    | `claude-haiku-4-5-20251001` | `qwen3.6-plus`            | `kimi-k2.6`       |
| **Docs**          | `claude-haiku-4-5-20251001` | `qwen3.6-plus`            | `kimi-k2.6`       |
| **Repo Explorer** | `claude-haiku-4-5-20251001` | `qwen3.6-plus`            | `kimi-k2.6`       |

---

## Agent Modes

| Agent             | Mode      | Description                                          |
| ----------------- | --------- | ---------------------------------------------------- |
| **Orchestrator**  | primary   | Main coordinator — Tab to switch to it               |
| **Architect**     | subagent  | Invoked by Orchestrator for design work              |
| **Implementer**   | subagent  | Invoked by Orchestrator for code implementation      |
| **Tester**        | subagent  | Invoked by Orchestrator for test generation          |
| **Reviewer**      | subagent  | Invoked by Orchestrator for code review              |
| **Task Coach**    | subagent  | Invoked by Orchestrator for intake clarification     |
| **Docs**          | subagent  | Invoked by Orchestrator for documentation updates    |
| **Repo Explorer** | subagent  | Invoked by Orchestrator for codebase exploration     |

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

**Recommended:** `mimo-v2.5-pro` or `minimax-m2.7` (OpenCode Go) or
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
| Code implementation             | OpenCode Go (`mimo-v2.5-pro`) or Claude (`sonnet`) |
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

## Context Budget

- If the task type differs from the previous one, execute "/clear" before
  starting.
- Delegate verbose operations to sub-agents.
