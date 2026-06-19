# Antigravity CLI (agy) Preset for CodeConductor

This preset configures CodeConductor for **Google Antigravity CLI (agy)** and Antigravity 2.0.

## Structure

When installed, this preset writes files into your project's workspace customizations root:

- **`.agents/AGENTS.md`**: Core agent contracts, routing policy, and workflow instructions.
- **`.agents/rules/`**: Target rules and style guidelines (e.g., commit messages, knowledge graphs).
- **`.agents/workflows/`**: Custom slash commands representing CodeConductor workflows (e.g., `/cc-feature`, `/cc-fix`).
- **`.agents/skills/`**: Domain-specific skills (e.g., Spring Boot, Django, Next.js).

---

## Orchestrator Agent Workflow

Antigravity CLI automatically parses `.agents/AGENTS.md` and registered workflows under `.agents/workflows/`.

To run any CodeConductor workflow:

1. Start the Antigravity CLI:
   ```bash
   agy
   ```
2. Run one of the custom slash commands:
   ```text
   /cc-feature "Describe the new feature to build"
   /cc-fix "Describe the bug and where it is"
   /cc-refactor "Describe the refactoring scope"
   ```

---

## Configuration Settings (`settings.json`)

To configure permissions, models, and execution modes for the Antigravity CLI, update your global settings at `~/.gemini/antigravity-cli/settings.json` or project-scoped settings.

Recommended settings:
```json
{
  "model": "gemini-3.5-pro",
  "toolPermission": "request-review",
  "enableTerminalSandbox": true,
  "allowNonWorkspaceAccess": false
}
```
