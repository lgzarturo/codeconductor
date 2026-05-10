# Complementary Tools Recommended for CodeConductor

After installing CodeConductor in your project and having your base environment
configured, these five tools complement the CodeConductor workflow to reduce
token consumption, improve code review, and maintain context across sessions.

---

## Quick Reference

| Tool                                                | Type           | What it does                                                     | Reported savings                |
| --------------------------------------------------- | -------------- | ---------------------------------------------------------------- | ------------------------------- |
| [RTK](#1-rtk)                                       | CLI Proxy      | Compresses bash command outputs before agents read them          | 60–90% tokens on bash           |
| [code-review-graph](#2-code-review-graph)           | MCP Server     | Codebase knowledge graph — agent reads only what matters         | 6.8×–49× less tokens in reviews |
| [token-savior](#3-token-savior)                     | MCP Server     | Symbol-based code navigation + persistent session memory         | 97% less tokens in navigation   |
| [caveman](#4-caveman)                               | Skill / Plugin | Agent responds like a caveman — same info, fewer words           | ~75% tokens in output           |
| [claude-token-efficient](#5-claude-token-efficient) | CLAUDE.md      | CLAUDE.md rules that eliminate verbosity by default              | ~63% tokens in output           |
| [Engram](#6-engram)                                 | Persistence    | Persistent memory with semantic search — context across sessions | 80%+ context reused             |
| [Gentle AI](#7-gentle-ai)                           | Ecosystem      | Ecosystem configurator for AI agents + Engram integration        | Unified configuration           |

> **Note:** The `CLAUDE.md` that CodeConductor generates already implements the
> same rules as `claude-token-efficient`. You don't need to install that project
> separately — it's already integrated.

---

## 1. RTK

**Repository:** [github.com/rtk-ai/rtk](https://github.com/rtk-ai/rtk) **Type:**
CLI Proxy (Rust binary, zero dependencies) **Impact:** Operates on agent
_inputs_ — compresses bash command outputs before they reach the context.

### What it does

RTK installs as a bash hook in your AI coding agent. When the agent runs
`git status`, `cat file`, `npm test`, etc., RTK intercepts the output and
compresses it by removing noise (blank lines, redundant paths, ANSI colors,
repetitive headers) before sending it to the model.

**Measured savings in a 30-minute session:**

| Command                   | Without RTK   | With RTK    | Savings  |
| ------------------------- | ------------- | ----------- | -------- |
| `ls` / `tree` × 10        | 2,000 tokens  | 400         | −80%     |
| `cat` / `read` × 20       | 40,000 tokens | 12,000      | −70%     |
| `git diff` × 5            | 10,000 tokens | 2,500       | −75%     |
| `npm test` / `pytest` × 5 | 25,000 tokens | 2,500       | −90%     |
| **Total estimated**       | **~118,000**  | **~23,900** | **−80%** |

### Installation

**macOS / Linux — Homebrew (recommended):**

```bash
brew install rtk
```

**macOS / Linux — Installation script:**

```bash
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
```

**Linux / macOS — Cargo:**

```bash
cargo install --git https://github.com/rtk-ai/rtk
```

**Windows — Precompiled binary:** Download the `.zip` from
[releases](https://github.com/rtk-ai/rtk/releases)
(`rtk-x86_64-pc-windows-msvc.zip`), extract and place `rtk.exe` in a directory
in your PATH. On Windows, using WSL is recommended for the full experience.

**Verify installation:**

```bash
rtk --version   # e.g., rtk 0.28.2
rtk gain        # shows savings statistics
```

### Configure with CodeConductor

For **Claude Code**:

```bash
rtk init -g
```

For **OpenCode**, RTK typically works through the bash hook as well. Check
OpenCode documentation for hook configuration.

This command injects the bash hook into the agent's configuration. Restart the
agent after. From that point on, all bash commands the agent runs automatically
pass through RTK.

### Integration with CodeConductor

RTK operates at the system level, not per-project — install once and it works in
any project with CodeConductor installed.

**Usage flow:**

```bash
# 1. Install RTK globally (one time)
brew install rtk

# 2. Initialize for your agent (choose one)
rtk init -g    # for Claude Code
# or configure for OpenCode per its docs

# 3. Install CodeConductor in your project
# (see manual-install-claude.md or manual-install-opencode.md)

# 4. RTK automatically compresses all agent's bash calls
```

> **Important:** RTK only acts on `Bash` tool calls. Native agent tools (`Read`,
> `Grep`, `Glob` in Claude Code; similar in OpenCode) don't go through the hook.
> For maximum savings in those cases, the agent should use `cat`, `rg`, `find`
> instead of the built-in tools — or call `rtk read`, `rtk grep`, `rtk find`
> directly.

---

## 2. code-review-graph

**Repository:**
[github.com/tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph)
**Type:** MCP Server (Python, Tree-sitter, SQLite) **Impact:** Operates on _how
much_ of the codebase the agent reads — instead of reading entire files, it
navigates a symbol graph.

### What it does

Parses your codebase with Tree-sitter and builds a graph of nodes (functions,
classes, imports) and edges (calls, inheritance, test coverage). When the agent
needs to understand a change, the graph calculates the "blast radius" — exactly
which files are affected — and the agent reads only those, not the entire
project.

**Measured savings:**

- Daily reviews: **6.8× less tokens**
- Large monorepos: **up to 49× less tokens** (Next.js: 27,732 files → ~15 read)
- Incremental update after each commit: **< 2 seconds** to re-index

**Supported languages:** 23 languages + Jupyter notebooks, including Kotlin,
Python, TypeScript, JavaScript, and PowerShell.

### Installation

**Requirement:** Python 3.10+ and `uv` (recommended) or `pip`.

```bash
# With pipx (recommended — installs in isolated environment)
pipx install code-review-graph

# With pip
pip install code-review-graph

# With uvx (no install, direct execution)
uvx code-review-graph install
```

### Configure with CodeConductor

For **Claude Code**:

```bash
# 1. Auto-detects Claude Code and configures the MCP + rules
code-review-graph install --platform claude-code

# 2. Build the graph for your project (run in project directory)
cd my-project
code-review-graph build
```

For **OpenCode**, use the same commands or adapt via OpenCode's MCP
configuration:

```bash
code-review-graph install --platform opencode
code-review-graph build
```

The `install` command writes MCP configuration to `~/.claude/settings.json` (for
Claude Code) or equivalent for OpenCode, and injects instructions into the
project's CLAUDE.md. The initial graph takes ~10 seconds on a 500-file project.
After that, it updates automatically with each change.

**Verify it works:** Open the agent in the project and write:

```
Build the code review graph for this project
```

### Integration with CodeConductor

`code-review-graph` complements the `code-review` skill that CodeConductor
installs. While the skill defines _how_ the agent should do the review
(structure, priorities), `code-review-graph` reduces _how much_ code the agent
needs to read to do it.

```bash
# Complete flow after CodeConductor installation:
cd my-project
# CodeConductor already installed with skills, agents, CLAUDE.md
code-review-graph install --platform claude-code  # or opencode
code-review-graph build        # indexes the codebase
```

When you use `@code-review` or the CodeConductor reviewer agent, it will have
the graph available to navigate code efficiently.

---

## 3. token-savior

**Repository:**
[github.com/Mibayy/token-savior](https://github.com/Mibayy/token-savior)
**Type:** MCP Server (Python, SQLite WAL + FTS5, 105 tools) **Impact:** Two
capabilities in one: symbol-based code navigation (97% less tokens) + persistent
memory across sessions.

### What it does

**Part 1 — Code navigation:** Instead of reading entire files, the agent
navigates by symbol. `find_symbol("send_message")` returns 67 chars vs 41M chars
reading the complete file. Indexed with AST, call graph, and transitive impact
analysis.

**Part 2 — Persistent memory:** Every decision, convention, bug fix, and
guardrail from the session is stored in SQLite with vector embeddings. At the
start of the next session, it re-injects relevant context as a compact delta.
Observations have TTL, contradictions are detected on save, and most-used
observations are automatically promoted.

**Benchmark on 60 real tasks:**

|                | Without token-savior | With token-savior |
| -------------- | -------------------- | ----------------- |
| Score          | 67/120 (56%)         | 115/120 (96%)     |
| Chars injected | 1,431,624            | 234,805 (−84%)    |

### Installation

**uvx (no venv, no clone — recommended):**

```bash
uvx token-savior-recall
```

**pip:**

```bash
pip install "token-savior-recall[mcp]"

# With hybrid vector search (BM25 + embeddings):
pip install "token-savior-recall[mcp,memory-vector]"
```

**In virtual environment (recommended for stable use):**

```bash
python3 -m venv ~/.local/venvs/token-savior
~/.local/venvs/token-savior/bin/pip install "token-savior-recall[mcp]"
```

### Configure with CodeConductor

Add the MCP server to your agent configuration.

For **Claude Code**, edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "token-savior-recall": {
      "command": "/path/to/venv/bin/token-savior",
      "env": {
        "WORKSPACE_ROOTS": "/path/to/your/project",
        "TOKEN_SAVIOR_CLIENT": "claude-code"
      }
    }
  }
}
```

Or with the Claude Code CLI:

```bash
claude mcp add token-savior -- ~/.local/venvs/token-savior/bin/token-savior
```

For **OpenCode**, add to its MCP configuration following OpenCode docs.

**Optional environment variables:**

```bash
TS_VIEWER_PORT=8080          # activates web viewer at localhost:8080
TS_AUTO_EXTRACT=1            # auto-extract observations post-tool-use
TS_API_KEY=sk-...            # required if TS_AUTO_EXTRACT=1
```

### Integration with CodeConductor

token-savior especially empowers the CodeConductor `testing-tdd` skill — having
memory of the project's testing conventions means the agent doesn't need to
re-discover them each session. It also complements `code-review` by navigating
code by symbol instead of reading entire files.

```bash
# Complete flow:
cd my-project
# CodeConductor already installed with skills, agents, CLAUDE.md
# Configure token-savior in ~/.claude/settings.json (once)
# From there, every session in the project benefits from accumulated memory
```

---

## 4. caveman

**Repository:**
[github.com/JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)
**Type:** Skill / Plugin for AI coding agents **Impact:** Operates on the
agent's _output_ — responses with the same technical information but 75% fewer
words.

### What it does

Makes the agent respond like a caveman: removes articles, courtesy phrases,
introductions, final summaries, and redundancies, maintaining all technical
substance.

**Before vs after:**

| Normal (69 tokens)                                                                                                                                                                                                                                | Caveman (19 tokens)                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| "The reason your React component is re-rendering is likely because you're creating a new object reference on each render cycle. When you pass an inline object as a prop, React's shallow comparison sees it as a different object every time..." | "New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`." |

**Intensity levels:**

- `/caveman lite` — short phrases, no extra articles (~40% less)
- `/caveman full` — standard caveman mode (~75% less) ← default
- `/caveman ultra` — absolute minimum of words (~85% less)
- `/caveman wenyan-full` — classical Chinese text mode (special mode)

### Installation

**Claude Code — marketplace (recommended):**

```bash
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman
```

**OpenCode and other agents:**

```bash
# Cursor, Windsurf, Copilot, Cline
npx skills add JuliusBrussee/caveman

# Gemini CLI
gemini extensions install https://github.com/JuliusBrussee/caveman
```

### Integration with CodeConductor

Caveman is a global plugin — install once and it's available in all projects
with CodeConductor installed.

CodeConductor creates `.claude/skills/` in the project. Although caveman works
best as a marketplace plugin (it has automatic session hooks), you can also copy
it as a local skill if you prefer:

```bash
# Option A: Global plugin (recommended for Claude Code)
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman

# Option B: Local skill in the project
mkdir -p .claude/skills/caveman
curl -o .claude/skills/caveman/SKILL.md \
  https://raw.githubusercontent.com/JuliusBrussee/caveman/main/skills/caveman/SKILL.md
```

**Typical flow in a development session:**

```
# Agent open in your project
/caveman            # activate caveman mode
@testing-tdd        # use your TDD skill — responses automatically compressed
@code-review        # review in caveman mode
/caveman ultra      # maximum compression for repetitive tasks
```

---

## 5. claude-token-efficient

**Repository:**
[github.com/drona23/claude-token-efficient](https://github.com/drona23/claude-token-efficient)
**Type:** Optimized CLAUDE.md **Impact:** Removes default verbose behaviors
(~63% less tokens in output).

### What it does

A CLAUDE.md file with precise rules that eliminate default agent behaviors that
don't add value:

- Sycophantic openings ("Sure!", "Great question!", "Happy to help!")
- Unnecessary closings ("I hope this helps! Let me know if anything!")
- Restating the question before answering
- Unsolicited suggestions beyond what was asked
- Over-engineering simple solutions

**Measured savings:**

| Test                     | Baseline      | Optimized     | Reduction |
| ------------------------ | ------------- | ------------- | --------- |
| Explain async/await      | 180 words     | 65 words      | −64%      |
| Code review              | 120 words     | 30 words      | −75%      |
| Hallucination correction | 55 words      | 20 words      | −64%      |
| **Total**                | **465 words** | **170 words** | **−63%**  |

### Integration status with CodeConductor

> **Already integrated.** The `CLAUDE.md` that CodeConductor generates contains
> exactly the same rules as this project. You don't need to install anything
> additional.

The content generated by CodeConductor is identical to the `CLAUDE.md` in the
`drona23/claude-token-efficient` repository. If you want to explore its
additional profiles:

```bash
# View specialized profiles from the repo
git clone https://github.com/drona23/claude-token-efficient /tmp/cte

# Profile for analysis/research tasks
cat /tmp/cte/profiles/CLAUDE.analysis.md

# Profile with more aggressive rules (M-drona23-v8, won external benchmark)
cat /tmp/cte/profiles/M-drona23-v8/CLAUDE.md
```

You can merge additional rules from those profiles into the CodeConductor
generated `CLAUDE.md` if your workflows require it.

---

## Complete Installation Flow After CodeConductor Setup

Recommended order for installing complementary tools after setting up
CodeConductor:

```bash
# ── STEP 0: Install CodeConductor in your project ────────────────────────
cd my-project
# Follow manual-install-claude.md or manual-install-opencode.md
# → Select tool (Claude / OpenCode or both)
# → Select stack
# → CLAUDE.md + skills + agents created

# ── STEP 1: RTK — bash compression (global, one time) ─────────────────────
brew install rtk          # macOS
# curl -fsSL .../install.sh | sh  # Linux
rtk init -g               # configure hook for Claude Code
# Restart your agent

# ── STEP 2: Caveman — output compression (global, one time) ──────────────
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman
# Restart your agent

# ── STEP 3: code-review-graph — codebase graph (per project) ───────────
pipx install code-review-graph
code-review-graph install --platform claude-code  # or opencode
code-review-graph build   # indexes the current project (~10s)

# ── STEP 4: token-savior — navigation + memory (global config) ───────────
python3 -m venv ~/.local/venvs/token-savior
~/.local/venvs/token-savior/bin/pip install "token-savior-recall[mcp]"
claude mcp add token-savior -- ~/.local/venvs/token-savior/bin/token-savior
# Restart your agent

# ── Verify everything ─────────────────────────────────────────────────────
rtk gain                  # shows accumulated RTK savings
rtk --version
code-review-graph build --stats  # graph statistics
```

---

## How They Work Together

Each tool operates on a different layer of the token pipeline:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT SESSION                          │
│                                                                 │
│  Your question / instruction                                    │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐                                           │
│  │  CLAUDE.md      │  claude-token-efficient (already integrated)│
│  │  + caveman      │  → Agent responds terse, without fluff     │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │  Engram         │  Persistent memory across sessions         │
│  │  (Gentle AI)    │  → Context from previous work              │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │  token-savior   │  Navigate code by symbol, not by file     │
│  │  code-review-   │  Only read relevant files from the graph   │
│  │  graph          │                                           │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │  Skills from    │  @testing-tdd, @code-review, @security   │
│  │  your project   │  (installed by CodeConductor)             │
│  │  + Gentle AI    │  SDD workflows, skill management          │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │  RTK            │  Compress bash outputs before they reach   │
│  └─────────────────┘  the agent's context                       │
└─────────────────────────────────────────────────────────────────┘
```

**Combined estimated result:**

- RTK: −80% in input tokens from bash commands
- code-review-graph + token-savior: −84% to −97% in code navigation
- CLAUDE.md + caveman: −63% to −75% in output tokens
- Engram + Gentle AI: 80%+ context reuse across sessions

In active development sessions with frequent commands and code reviews, the
combination can reduce total token consumption by **85–95%** compared to a
session with no optimizations.

---

## Troubleshooting

**RTK doesn't compress commands:**

```bash
rtk gain   # if shows 0, the hook isn't active
rtk init -g --force  # reinstall the hook
# Completely restart your agent (not just reload)
```

**code-review-graph doesn't find the MCP:**

```bash
# Verify it's in the agent config
cat ~/.claude/settings.json | grep -A5 "code-review-graph"
# If not present, re-run:
code-review-graph install --platform claude-code
```

**token-savior doesn't start:**

```bash
# Verify the binary path
~/.local/venvs/token-savior/bin/token-savior --version
# If it fails, reinstall:
~/.local/venvs/token-savior/bin/pip install --upgrade "token-savior-recall[mcp]"
```

**caveman doesn't activate automatically at session start:**

```bash
# Verify plugin installation
claude plugin list | grep caveman
# If not present:
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman
```

**Windows — RTK:** On native Windows, RTK has limited support. Using WSL is
recommended where the full hook works natively. Extract `rtk.exe` to a directory
in your PATH and run from PowerShell or Windows Terminal (not double-click).

---

## 6. Engram

**Repository:**
[github.com/Gentleman-Programming/engram](https://github.com/Gentleman-Programming/engram)
**Type:** Persistent Memory (Go binary, SQLite + FTS5, MCP server, HTTP API,
CLI, TUI) **Stars:** 3.4k **License:** MIT **Impact:** Provides persistent
memory with semantic search across sessions — agents reuse 80%+ of context
instead of starting fresh each time.

### What it does

Engram is an agent-agnostic persistent memory system that works with Claude
Code, OpenCode, Gemini CLI, Codex, VS Code, and more. It stores observations,
decisions, and context in SQLite with FTS5 full-text search, and exposes them
via MCP tools (`mem_save`, `mem_search`, `mem_context`, `mem_session_start`,
`mem_session_summary`, etc.).

**Key features:**

- **MCP Server:** Direct tool access to save, search, and retrieve memories
- **Git sync:** `engram sync` for cross-machine sharing
- **Cloud:** Optional replication with Docker for team workflows
- **TUI mode:** Interactive memory browser
- **HTTP API:** Programmatic access for custom integrations

**Token savings:** By maintaining context across sessions instead of
re-explaining project conventions, architecture decisions, and preferences,
users report 80%+ context reuse.

### Installation

**macOS / Linux — Homebrew (recommended):**

```bash
brew install gentleman-programming/tap/engram
```

**Binary download:** Download precompiled binaries from the
[releases page](https://github.com/Gentleman-Programming/engram/releases).

**Build from source:**

```bash
go install github.com/gentleman-programming/engram/cmd/engram@latest
```

### Configure with CodeConductor

For **Claude Code**:

```bash
# Add the Engram plugin from marketplace
claude plugin marketplace add Gentleman-Programming/engram

# Install the plugin
claude plugin install engram

# Setup for OpenCode
engram setup opencode
```

### Usage examples

**Save an observation (auto-triggers after significant work):**

```bash
# Or from within the agent using MCP tool:
mem_save title="JWT auth middleware" content="**What**: Replaced express-session with jsonwebtoken for auth
**Why**: Session storage doesn't scale across multiple instances
**Where**: src/middleware/auth.ts, src/routes/login.ts"
```

**Search past context:**

```bash
mem_search query="how did we handle auth in previous sessions"
```

**Get session context at start:**

```bash
mem_context
# Returns relevant memories from previous sessions
```

**Sync across machines:**

```bash
engram sync
```

### Integration with Gentle AI

Engram integrates seamlessly with Gentle AI (see next section) — Gentle AI can
automatically configure Engram as part of its ecosystem setup, and the SDD
workflows use Engram memories to maintain project context across sessions.

---

## 7. Gentle AI

**Repository:**
[github.com/Gentleman-Programming/gentle-ai](https://github.com/Gentleman-Programming/gentle-ai)
**Type:** Ecosystem Configurator (Go-based CLI) **Stars:** 2.8k **License:** MIT
**Impact:** Unifies configuration across 13 AI coding agents, integrates Engram
for persistent memory, enables SDD workflows and skill management.

### What it does

Gentle AI is a Go-based ecosystem configurator for AI coding agents. It supports
13 agents: Claude Code, OpenCode, Kilo Code, Gemini CLI, Cursor, VS Code
Copilot, Codex, Windsurf, Antigravity, Kimi Code, Kiro IDE, Qwen Code, and
OpenClaw.

**Key features:**

- **Persistent memory integration:** Automatically configures Engram for memory
- **SDD workflows:** Built-in support for Spec-Driven Development with skills
  for propose, spec, design, apply, verify, and archive
- **Skills system:** Registry and management of AI agent skills
- **MCP servers:** Configuration and management of MCP server connections
- **AI provider switcher:** Switch between OpenAI, Anthropic, Google, and others
- **Per-phase model assignment:** Different models for different workflow phases

### Installation

**macOS / Linux — Installation script (recommended):**

```bash
curl -fsSL https://raw.githubusercontent.com/Gentleman-Programming/gentle-ai/main/scripts/install.sh | bash
```

**Windows — Scoop:**

```bash
scoop bucket add gentleman https://github.com/Gentleman-Programming/scoop-bucket
scoop install gentle-ai
```

**Go install:**

```bash
go install github.com/gentleman-programming/gentle-ai/cmd/gentle-ai@latest
```

**Verify installation:**

```bash
gentle-ai --version
```

### Usage examples

**Initialize SDD in a project:**

```bash
cd my-project
gentle-ai sdd-init
# Detects stack, conventions, testing capabilities
# Bootstraps the active persistence backend
```

**Update skills registry:**

```bash
gentle-ai skill-registry
# Scans user skills and project conventions
# Writes .atl/skill-registry.md
```

**Use SDD workflow commands:**

```bash
gentle-ai sdd-propose   # Create change proposal
gentle-ai sdd-spec      # Write specifications
gentle-ai sdd-design    # Create technical design
gentle-ai sdd-apply     # Implement tasks
gentle-ai sdd-verify    # Validate implementation
gentle-ai sdd-archive   # Archive completed change
```

**Configure AI provider:**

```bash
gentle-ai config set provider anthropic
gentle-ai config set model claude-sonnet-4-6
```

### Integration with Engram

Gentle AI automatically integrates with Engram when setting up a project. The
`sdd-init` command can configure Engram as the persistent memory backend, and
the SDD workflow skills use Engram's `mem_save`, `mem_search`, and
`mem_session_summary` to maintain context across sessions.

```bash
# Combined workflow:
gentle-ai sdd-init              # Initialize project with Engram
# ... work on features ...
gentle-ai sdd-propose           # Create proposal with Engram context
gentle-ai sdd-spec              # Write spec
gentle-ai sdd-apply             # Implement
gentle-ai sdd-verify            # Verify against spec
gentle-ai sdd-archive           # Archive with final summary saved to Engram
```

### Integration with CodeConductor

Gentle AI and CodeConductor serve complementary purposes:

- **CodeConductor** provides the agent contracts, routing policies, and
  structured workflow definitions (Task Card, orchestrator, implementer, etc.)
- **Gentle AI** provides the ecosystem tooling around those agents — Engram
  integration, SDD command-line workflow, and cross-agent configuration

You can use them together: CodeConductor defines _what_ agents do, Gentle AI
orchestrates _how_ they work together with persistent memory.

```bash
# Combined workflow:
gentle-ai sdd-init              # Initialize with Engram
# CodeConductor already installed via manual-install
gentle-ai sdd-propose           # Create proposal
# Work with CodeConductor agents...
gentle-ai sdd-verify            # Verify implementation
gentle-ai sdd-archive           # Archive, context saved to Engram
```
