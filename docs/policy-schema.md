# Policy Schema

## Purpose

This document defines the planned schema for `policy.yml`.

The policy is declarative in v0.1.x. CodeConductor does not currently compile or
enforce it at runtime.

## Schema

```yaml
version: number

runtime:
  user: string
  mode: sandboxed | native
  cleanEnv: boolean
  network:
    default: allow | ask | deny
    allowDomains: string[]

filesystem:
  workspace: ro | rw

denyRead: string[]
denyWrite: string[]

targets:
  [targetName]:
    unsupportedRules: string[]
    warnings: string[]

commands:
  allow: string[]
  ask: string[]
  deny: string[]

git:
  protectedBranches: string[]
  deny: string[]
```

## Field Semantics

### `version`

Schema version for the policy file.

### `runtime`

Declares the intended runtime posture.

- `user`: planned low-privilege execution user
- `mode`: `native` for target-tool-dependent execution, `sandboxed` for future
  runtime isolation
- `cleanEnv`: whether the runtime should start with a minimized environment
- `network.default`: default network posture
- `network.allowDomains`: domain allowlist when network access is permitted or
  requires confirmation

### `filesystem`

Declares workspace access.

- `ro`: read-only workspace
- `rw`: read-write workspace

### `denyRead`

Path patterns that agents must not read.

### `denyWrite`

Path patterns that agents must not write.

### `targets`

Target-specific compatibility metadata. This is used by future renderers and
`doctor` checks to report where `policy.yml` cannot be represented by a target
tool.

- `unsupportedRules`: canonical policy rules the target cannot enforce
- `warnings`: human-readable warnings that must be surfaced during rendering or
  validation

### `commands`

Command policy grouped by action:

- `allow`: may run without confirmation
- `ask`: requires explicit confirmation
- `deny`: must not run

### `git`

Git-specific policy for protected branches and high-risk operations.

## Runtime Security Rule

Deny rules are not sufficient for runtime security. A future policy compiler
must parse commands structurally instead of matching raw strings.

Raw string matching can miss bypasses through shell operators, aliases,
redirection, command substitution, environment variables, glob expansion, and
platform-specific shell behavior.

## Compatibility Rule

`policy.yml` is the canonical security contract. Target configuration files are
rendered views of that contract. If a target cannot enforce a policy rule, the
renderer must keep the canonical rule and emit an explicit compatibility warning
instead of weakening or omitting the policy silently.
