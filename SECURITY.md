# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | yes       |

## Current Security Model

CodeConductor currently ships declarative policies and target-specific
guardrails. It does not yet enforce sandboxing directly.

Policy files, agent contracts, and manual installation guides define intended
boundaries for reads, writes, commands, network access, and protected branches.
Actual enforcement depends on the target tool.

Recommended execution uses defense in depth:

- run agents under a low-privilege OS user
- keep agent work in a dedicated Git Worktree
- deny secret paths in the target tool configuration
- avoid inherited secret environment variables
- require human review for risky commands, protected branches, and high-risk
  paths

## Not Yet Implemented

- OS-level sandbox
- Dedicated low-privilege agent user
- Policy compiler
- Command parser with structured allowlist
- Runtime filesystem isolation
- Symlink escape protection
- Secret redaction in logs
- Automatic verification that target presets fully enforce `policy.yml`

## Reporting a Vulnerability

Open a private security advisory or contact the maintainer. Do not disclose
exploitable issues publicly before confirmation.
