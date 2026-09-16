# CodeConductor CLI

## setup

Configure and install CodeConductor.

```text
cc-codeconductor setup [--target <target>] [--locale en|es] [--yes] [--dry-run]
```

## detect

Inspect the project stack and recommended presets.

```text
cc-codeconductor detect
```

## init

Initialize low-level CodeConductor configuration.

```text
cc-codeconductor init [--locale en|es]
```

## install

Install harness components.

```text
cc-codeconductor install preset --target <target>
```

## version

Show CLI and project harness versions.

```text
cc-codeconductor version [--json]
```

## status

Show installed harness state.

```text
cc-codeconductor status [--json]
```

## doctor

Diagnose the installation.

```text
cc-codeconductor doctor
```

## update

Safely reconcile managed harness files.

```text
cc-codeconductor update [--dry-run] [--force]
```

## migrate

Apply compatibility migrations.

```text
cc-codeconductor migrate [--dry-run]
```

## docs

Read bundled command documentation.

```text
cc-codeconductor docs [command]
```

## completion

Generate shell completion.

```text
cc-codeconductor completion <bash|zsh|fish|powershell>
```

## hook

Run installed agent hooks.

```text
cc-codeconductor hook <pre-tool|post-tool|session-start>
```

## cc-help

Show a target preset inventory.

```text
cc-codeconductor cc-help --target <target>
```

## ask

Recommend a slash-command workflow.

```text
cc-codeconductor ask "problem"
```

## goal

Plan a goal into dependent tasks.

```text
cc-codeconductor goal "objective"
```

## ingest

Ingest repository knowledge into the product graph.

```text
cc-codeconductor ingest
```

## product

Explore the product graph and memory.

```text
cc-codeconductor product <subcommand>
```

## ccep

Run CCEP contract workflows.

```text
cc-codeconductor ccep <subcommand>
```

## openspec

Run the OpenSpec delivery loop.

```text
cc-codeconductor openspec <subcommand>
```

## scorecard

Record and aggregate outcomes.

```text
cc-codeconductor scorecard <subcommand>
```

## orchestrate

Run goal execution orchestration.

```text
cc-codeconductor orchestrate <subcommand>
```

## impact

Analyze change impact.

```text
cc-codeconductor impact [--files <paths>]
```

## verify

Verify task completion with evidence.

```text
cc-codeconductor verify --task <id>
```

## seo

Audit SEO and generate llms.txt.

```text
cc-codeconductor seo audit --url <url>
```

## debt-harvest

Scan source files for deferred debt.

```text
cc-codeconductor debt-harvest
```

