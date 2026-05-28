# CodeConductor CLI Usage Guide

This document explains how to run CodeConductor locally and how to package it
for distribution as an npm package executable via `npx`.

## Requirements

- **Runtime**: Bun ≥1.0 or Node.js ≥20.11
- **Package Manager**: npm, yarn, or pnpm (for publishing)

---

## Running the Project Locally

There are two ways to run CodeConductor locally: using the development script or
building and running the compiled output.

### Option 1: Development Mode (using Bun)

The fastest way to run CodeConductor during development:

```bash
bun run src/cli/main.ts --help
```

This runs the TypeScript source directly without compilation. All CLI commands
work:

```bash
bun run src/cli/main.ts init
bun run src/cli/main.ts detect
bun run src/cli/main.ts install council --target opencode
bun run src/cli/main.ts doctor
bun run src/cli/main.ts update
```

### Option 2: Build and Run

Build the project first, then run the compiled JavaScript:

```bash
bun run build
node dist/index.js --help
```

The build script (`bun build src/cli/main.ts --target=node --outdir=dist`)
compiles TypeScript to JavaScript and outputs to the `dist/` directory.

---

## CLI Commands Reference

### `init` — Initialize CodeConductor

Detects the project stack and creates the `.codeconductor/` configuration
directory.

```bash
# Standard initialization (detects stack, writes config)
npx cc-codeconductor init

# Overwrite existing configuration
npx cc-codeconductor init --force

# Write configuration to home directory (~/.codeconductor/)
npx cc-codeconductor init --global

# Preview actions without writing files
npx cc-codeconductor init --dry-run
```

**What it does:**

1. Detects project stack (language, runtime, framework)
2. Creates `.codeconductor/config.yml` with detected settings
3. Copies `council.yml` and `policy.yml` into `.codeconductor/presets/`

---

### `detect` — Detect Project Stack

Analyzes the current directory to identify the technology stack.

```bash
# Detect and display results
npx cc-codeconductor detect

# Output in JSON format for scripting
npx cc-codeconductor detect --output json
```

**Output example:**

```
Detected:
  - languages: javascript, typescript
  - runtimes: node, bun
  - frameworks: express, react
```

---

### `install council` — Install Council Preset

Generates and writes preset configuration files for AI agent runners (OpenCode,
Claude Code, Codex).

```bash
# Install for a specific target
npx cc-codeconductor install council --target opencode
npx cc-codeconductor install council --target claude
npx cc-codeconductor install council --target codex

# Install for all supported targets
npx cc-codeconductor install council --target all

# Install to home directory instead of project
npx cc-codeconductor install council --target opencode --global

# Preview without writing files
npx cc-codeconductor install council --target opencode --dry-run

# Overwrite existing files
npx cc-codeconductor install council --target opencode --force
```

**Files generated per target:**

| Target     | Files written                                                    |
| ---------- | ---------------------------------------------------------------- |
| `opencode` | `.opencode/commands/council.md`, `.opencode/agents/council-*.md` |
| `claude`   | `.claude/skills/council/SKILL.md`, `.claude/agents/council-*.md` |
| `codex`    | `.codex/config.toml`, `.codex/agents/council_*.toml`             |

---

### `doctor` — Validate Configuration

Checks that configuration files exist and are valid.

```bash
npx cc-codeconductor doctor
```

**What it validates:**

- `.codeconductor/config.yml` exists and is valid YAML
- Runner directories exist for configured targets
- Reports warnings for missing or invalid configurations

---

### `update` — Update Installed Presets

Re-applies the council preset based on current configuration.

```bash
# Standard update
npx cc-codeconductor update

# Overwrite existing preset files
npx cc-codeconductor update --force

# Preview actions without writing
npx cc-codeconductor update --dry-run
```

---

## Global Options

| Flag             | Description                                        |
| ---------------- | -------------------------------------------------- |
| `--help`, `-h`   | Show help message                                  |
| `--dry-run`      | Preview actions without writing files              |
| `--force`        | Allow overwriting existing files                   |
| `--global`       | Target home directory instead of project directory |
| `--output`, `-o` | Output format: `human` (default) or `json`         |

---

## Packaging for Distribution

To distribute CodeConductor as an executable package via `npx`, you need to
publish it to the npm registry.

### Step 1: Build the Package

```bash
bun run build
```

This creates the `dist/index.js` entry point defined in `package.json`:

```json
{
  "bin": {
    "codeconductor": "./dist/index.js"
  }
}
```

### Step 2: Publish to npm

```bash
npm publish
```

Or for a specific scope:

```bash
npm publish --access public
```

### Step 3: Run via npx

Once published, anyone can run CodeConductor without installation:

```bash
npx cc-codeconductor init --dry-run
npx cc-codeconductor detect
npx cc-codeconductor install council --target opencode
npx cc-codeconductor doctor
```

### Note on Shebang

For `npx` to work correctly, the `dist/index.js` file must include a proper
shebang at the top:

```javascript
#!/usr/bin/env node
// ... rest of the code
```

The build process should preserve this. If not, add it manually after building:

```bash
echo '#!/usr/bin/env node' | cat - dist/index.js > dist/index.js.tmp && mv dist/index.js.tmp dist/index.js
```

---

## Configuration Directory Structure

After running `init`, the following structure is created:

```text
.codeconductor/
├── config.yml          # Project settings (target, preset versions)
└── presets/
    ├── council.yml     # Customizable council agent configuration
    └── policy.yml      # Customizable routing policy rules
```

Edit `.codeconductor/presets/council.yml` to customize agents before running
`install`.
