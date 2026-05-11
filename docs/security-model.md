# Security Model

## Purpose

This document defines the current security posture of CodeConductor.

CodeConductor is not currently a sandbox. It is a workflow and policy framework
that generates guardrails for target tools.

For the detailed Codex, OpenCode, and Claude preset comparison, see
`docs/preset-security-analysis.md`.

## Threat Model

CodeConductor assumes agents may make incorrect, overbroad, or unsafe tool
requests. The security model is designed to reduce accidental damage, prevent
obvious high-risk operations, and make agent behavior reviewable.

Primary risks:

- Reading secrets from project or user directories
- Writing outside the intended workspace
- Running destructive shell commands
- Pushing or rewriting Git history without review
- Installing or executing untrusted remote code
- Treating planned runtime protections as implemented protections

## Current Guarantees

CodeConductor currently provides:

- Declarative policy files
- Target-specific permission presets
- Agent contracts that require explicit routing and review gates
- Documentation for protected branches and high-risk commands
- Manual install guides for OpenCode and Claude Code-compatible presets

These guarantees are documentation and configuration guarantees. They are not
runtime isolation guarantees.

## Defense-in-Depth Model

CodeConductor security is designed as layered defense. No single layer is
treated as sufficient.

| Layer         | Current status                         | Goal                                     |
| ------------- | -------------------------------------- | ---------------------------------------- |
| Identity      | Manual `cc-agent` guide                | Low-privilege execution identity checks  |
| Workspace     | Manual Git Worktree guidance           | Worktree-per-session execution           |
| Filesystem    | Declarative deny rules                 | Real-path and symlink-safe enforcement   |
| Commands      | Target-specific string patterns        | Structured command policy compiler       |
| Network       | Target-specific ask/deny controls      | Domain-scoped and role-scoped access     |
| Secrets       | Denied paths and environment guidance  | Secret path and environment diagnostics  |
| Human gates   | Task Card, plan, review checkpoints    | Verifiable workflow gate tracking        |

Use all available layers. Running agents as a primary developer user with broad
filesystem access is outside the recommended posture.

## Non-Guarantees

CodeConductor does not currently guarantee:

- OS-level isolation
- Shell sandboxing
- Filesystem containment
- Symlink escape protection
- Secret redaction in logs
- Structured parsing of shell commands
- Enforcement of policy rules independent of the target tool
- Prevention of all command obfuscation or shell expansion bypasses

## Trust Boundaries

The main trust boundaries are:

- The local machine running the target tool
- The repository workspace
- The target tool permission system
- The agent model and its tool-call behavior
- The human reviewer who approves risky operations

CodeConductor controls only the contracts, presets, templates, and policy
documents it ships. It does not control the operating system or the target tool
runtime.

## Target Tool Dependency

All enforcement in v0.1.x depends on the target tool. If a target tool allows a
command, read, write, network call, or sub-agent action despite a CodeConductor
policy file, CodeConductor cannot block it at runtime.

Target presets should therefore be treated as the effective enforcement layer
until CodeConductor ships a policy compiler and runtime validation.

## Target Security Compatibility

`policy.yml` is the canonical intended policy, but targets do not expose the
same enforcement surface.

| Policy area     | OpenCode                         | Claude Code                     | Codex CLI                         |
| --------------- | -------------------------------- | ------------------------------- | --------------------------------- |
| Command rules   | Config permission patterns       | Settings allow/deny patterns    | Contract guidance in `AGENTS.md`  |
| Read rules      | Config read deny rules           | Limited preset representation   | Contract guidance in `AGENTS.md`  |
| Write rules     | Config edit deny rules           | Limited preset representation   | Contract guidance in `AGENTS.md`  |
| Network rules   | `webfetch` / `websearch` policy  | Target-dependent                | Target-dependent                  |
| Role tools      | Agent frontmatter plus config    | Role text plus runtime settings | Role text in `AGENTS.md`          |
| Runtime sandbox | Target-dependent                 | Target-dependent                | Target-dependent                  |

Future renderers must mark every canonical rule as `enforced`, `documented`,
`manual`, or `unsupported` per target. A rule that cannot be represented by the
target must produce an explicit warning instead of being silently dropped.

## Planned Runtime Isolation

Runtime isolation is planned after the documentation-first preset stage.

Planned capabilities include:

- Policy schema validation
- Doctor checks for risky permissions
- Doctor checks for target policy drift and least-privilege role tools
- Policy compiler
- Structured command allowlist
- Filesystem boundary validation
- Symlink escape checks
- Optional low-privilege execution user
- Optional worktree-per-session execution
- Optional containerized execution

## Command Policy Design

Current command policies are string patterns. This is useful for target tool
configuration, but it is not sufficient for runtime security.

A future policy compiler must parse commands structurally instead of matching
raw strings. It must understand command names, arguments, shell operators,
redirection, glob expansion, environment variables, and command substitution.

## Filesystem Policy Design

Current filesystem policy is declarative. It identifies intended read and write
boundaries, denied secret paths, and protected internal directories.

A future runtime must resolve real paths before enforcing policy. It must handle
relative paths, symlinks, junctions, workspace escapes, case sensitivity, and
platform-specific path behavior.

## Known Weaknesses

- `policy.yml` is not compiled or enforced by CodeConductor today.
- Target presets can drift from the canonical `policy.yml` intent.
- String-based command matching can miss shell-level bypasses.
- Target tools may interpret permissions differently.
- Manual installation can drift from the repository preset.
- Logs may contain sensitive data if the target tool records command output.
- Runtime boundaries are documented but not enforced by CodeConductor itself.
