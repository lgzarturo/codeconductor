# CodeConductor CLI Commands Reference

Reference documentation for all available commands in the CodeConductor CLI.

---

## Global Flags

These flags can be used with any command:

| Flag             | Shortcut | Description                                                                               |
| ---------------- | -------- | ----------------------------------------------------------------------------------------- |
| `--help`         | `-h`     | Show the help message with usage information                                              |
| `--version`      | `-v`     | Show the package version                                                                  |
| `--dry-run`      | —        | Preview what would happen without writing any files                                       |
| `--force`        | —        | Allow overwriting existing files                                                          |
| `--global`       | —        | Install to home directory instead of project directory (`~/.opencode`, `~/.claude`, etc.) |
| `--output`, `-o` | —        | Output mode: `human` (default, readable text) or `json` (structured data)                 |

---

## Commands

### `codeconductor init`

Initializes CodeConductor in a project by creating the configuration file and
copying bundled presets.

**Behavior:**

1. Detects the project stack (languages, frameworks, runtimes)
2. Creates `.codeconductor/config.yml` with project metadata
3. Copies bundled presets (`council.yml`, `policy.yml`) to
   `.codeconductor/presets/`

**Supported stacks detection:**

- Node.js / Bun (via `package.json`, `node_modules`, `bun.lock`)
- Spring (via `build.gradle`, `pom.xml`)
- Django (via `manage.py`, `requirements.txt`)
- Astro (via `astro.config.mjs`)

**Options:**

- `--global` — Create global config in home directory instead of project
  directory
- `--dry-run` — Show what would be created without writing files
- `--force` — Overwrite existing configuration
- `--output, -o` — Output format (human/json)

**Exit codes:**

- `0` — Success
- `1` — Error (file write failure)
- `3` — No project signals detected (empty or unsupported project)

**Examples:**

```bash
# Initialize in current project
cc-codeconductor init

# Initialize globally (user home directory)
cc-codeconductor init --global

# Preview initialization without writing files
cc-codeconductor init --dry-run

# Overwrite existing configuration
cc-codeconductor init --force

# JSON output for scripting
cc-codeconductor init --output json
```

---

### `codeconductor init --global`

Global initialization variant. Creates configuration in the user's home
directory (`~/.codeconductor/config.yml` on Unix,
`%USERPROFILE%\.codeconductor\` on Windows) instead of the current project.

Useful for setting up CodeConductor without modifying a specific project, or for
personal defaults that apply across all projects.

---

### `codeconductor detect`

Analyzes the current project to identify its technology stack and recommends
suitable presets.

**What it detects:**

- **Languages:** javascript, typescript, java, kotlin, python
- **Runtimes:** node, bun, jvm, python
- **Package managers:** npm, bun
- **Frameworks:** spring, django, astro

**Output includes:**

- Detected signals (`package.json`, `build.gradle`, etc.)
- Detection confidence level (`low`, `medium`, `high`)
- Recommended presets based on detected stack

**Recommended presets by stack:**

| Detected Stack | Recommended Presets                |
| -------------- | ---------------------------------- |
| Any project    | `council`                          |
| Node.js / Bun  | `council`, `node-best-practices`   |
| Spring         | `council`, `spring-best-practices` |
| Django         | `council`, `django-best-practices` |

**Options:**

- `--output, -o` — Output format (human/json)

**Exit codes:**

- `0` — Success (signals detected)
- `3` — No signals detected (empty or unsupported project)
- `1` — Error

**Example:**

```bash
cc-codeconductor detect
# Output:
# Detected: node, typescript
# Frameworks: none
# Confidence: high
# Recommended: council, node-best-practices
```

---

### `cc-codeconductor install preset --target <target>`

Installs a complete preset package including agents, prompts, skills, and
commands for the specified runner.

**Targets:**

| Target     | Installs to     | Description                       |
| ---------- | --------------- | --------------------------------- |
| `opencode` | `.opencode/`    | OpenCode agent configuration      |
| `claude`   | `.claude/`      | Claude (Anthropic) agent config   |
| `codex`    | `.codex/`       | Codex (OpenAI) agent config       |
| `all`      | All three above | Install for all supported runners |

**Options:**

- `--target <target>` — Target runner(s): `opencode`, `claude`, `codex`, or
  `all`
- `--global` — Install to home directory instead of project
- `--dry-run` — Preview installation without writing files
- `--force` — Overwrite existing files
- `--output, -o` — Output format

**Exit codes:**

- `0` — Success
- `1` — Error (preset load failure)
- `2` — Partial failure (some files couldn't be written)

**Examples:**

```bash
# Install preset for OpenCode
cc-codeconductor install preset --target opencode

# Install preset for all runners
cc-codeconductor install preset --target all

# Install globally for Claude
cc-codeconductor install preset --target claude --global

# Preview what would be installed
cc-codeconductor install preset --target all --dry-run

# Force overwrite existing files
cc-codeconductor install preset --target opencode --force
```

---

### `cc-codeconductor install council --target <target>`

Installs only the council specification files (agent definitions, policies)
without full preset contents. This is a lighter-weight installation focused on
the council structure.

**Targets:**

| Target     | Installs to     | Content                         |
| ---------- | --------------- | ------------------------------- |
| `opencode` | `.opencode/`    | OpenCode-formatted council spec |
| `claude`   | `.claude/`      | Claude-formatted council spec   |
| `codex`    | `.codex/`       | Codex-formatted council spec    |
| `all`      | All three above | All three formats               |

**Options:**

- `--target <target>` — Target runner(s)
- `--global` — Install to home directory
- `--dry-run` — Preview without writing files
- `--force` — Overwrite existing files
- `--output, -o` — Output format

**Examples:**

```bash
# Install council spec for OpenCode
cc-codeconductor install council --target opencode

# Install council for all runners
cc-codeconductor install council --target all

# Global installation for Claude
cc-codeconductor install council --target claude --global

# Preview council installation
cc-codeconductor install council --target all --dry-run
```

---

### `codeconductor doctor`

Validates the CodeConductor configuration and installed files, checking for
common issues.

**Checks performed:**

1. **Config exists** — `.codeconductor/config.yml` must be present
2. **Config valid** — Configuration passes schema validation
3. **Runner directories** — Check for `.opencode/`, `.claude/`, `.codex/`
   directories
4. **Council enabled** — Verifies council preset is enabled
5. **Security compatibility** — Checks if target can enforce the policy model

**Options:**

- `--output, -o` — Output format

**Exit codes:**

- `0` — All checks passed
- `1` — Config validation failed
- `4` — Config not found or critical checks failed

**Example:**

```bash
cc-codeconductor doctor
# Output:
# ✓ config-exists: .codeconductor/config.yml exists
# ✓ config-valid: Config is valid
# ✓ dir-.opencode: .opencode/ exists
# ✓ dir-.claude: .claude/ not found (optional)
# ✓ dir-.codex: .codex/ not found (optional)
# ✓ council-enabled: Council preset enabled (v1.0.0)
# ✓ security-opencode: opencode can represent the canonical policy model
```

---

### `codeconductor update`

Updates installed presets to the latest version from `.codeconductor/presets/`.

**Behavior:**

1. Loads current configuration
2. Compares installed version with preset version
3. If updates available, regenerates files for the default target
4. Reports changed files

**Options:**

- `--dry-run` — Show what would be updated without making changes
- `--force` — Overwrite existing files during update
- `--output, -o` — Output format

**Exit codes:**

- `0` — Success (update applied or already up to date)
- `1` — Error (no config, load failure)
- `2` — Partial failure (some files couldn't be written)
- `4` — Council preset not enabled

**Example:**

```bash
# Check for updates
cc-codeconductor update --dry-run
# Output: Already up to date (v1.0.0)

# Apply available updates
cc-codeconductor update
# Output: Updated successfully (v1.0.0 → v1.1.0)

# Force overwrite during update
cc-codeconductor update --force
```

---

## Target Resolution

The `--target` option accepts these values:

```typescript
type RunnerTarget = 'opencode' | 'claude' | 'codex' | 'all'
```

When `--target all` is specified, the command applies to all three runners
sequentially.

When `--global` is combined with `--target`, installation goes to:

- Unix: `~/.opencode/`, `~/.claude/`, `~/.codex/`
- Windows: `%USERPROFILE%\.opencode\`, etc.

## Exit Code Reference

| Code | Meaning                                        |
| ---- | ---------------------------------------------- |
| `0`  | Success                                        |
| `1`  | Error (generic)                                |
| `2`  | Partial success (some files failed)            |
| `3`  | No project signals / Unsupported project       |
| `4`  | Configuration missing or critical check failed |

## Output Modes

### Human (`--output human`)

Default output format. Readable text with progress messages, lists, and
formatted tables.

```
✓ Council preset installed to .opencode/
✓ Council preset installed to .claude/
```

### JSON (`--output json`)

Structured output suitable for scripting and integration.

```json
{
  "success": true,
  "command": "install",
  "targets": ["opencode", "claude"],
  "written": [
    ".opencode/agents/council-architect.md",
    ".opencode/agents/council-security.md",
    ".claude/agents/council-architect.md"
  ]
}
```
