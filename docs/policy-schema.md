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

filesystem:
  workspace: ro | rw

denyRead: string[]
denyWrite: string[]

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

### `filesystem`

Declares workspace access.

- `ro`: read-only workspace
- `rw`: read-write workspace

### `denyRead`

Path patterns that agents must not read.

### `denyWrite`

Path patterns that agents must not write.

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
