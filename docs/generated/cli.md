# CodeConductor CLI

## setup

Configure and install CodeConductor.

```text
cc setup [--target <target>] [--locale en|es] [--yes] [--dry-run]
```

## detect

Inspect the project stack and recommended presets.

```text
cc detect
```

## init

Initialize low-level CodeConductor configuration.

```text
cc init [--locale en|es]
```

## install

Install harness components.

```text
cc install preset --target <target>
```

## version

Show CLI and project harness versions.

```text
cc version [--json]
```

## status

Show installed harness state.

```text
cc status [--json]
```

## doctor

Diagnose the installation.

```text
cc doctor
```

## update

Safely reconcile managed harness files.

```text
cc update [--dry-run] [--force]
```

## migrate

Apply compatibility migrations.

```text
cc migrate [--dry-run]
```

## docs

Read bundled command documentation.

```text
cc docs [command]
```

## completion

Generate shell completion.

```text
cc completion <bash|zsh|fish|powershell>
```

## hook

Run installed agent hooks.

```text
cc hook <pre-tool|post-tool|session-start>
```

## cc-help

Show a target preset inventory.

```text
cc cc-help --target <target>
```

## ask

Recommend a slash-command workflow.

```text
cc ask "problem"
```

## goal

Plan a goal into dependent tasks.

```text
cc goal "objective"
```

## ingest

Ingest repository knowledge into the product graph.

```text
cc ingest
```

## product

Explore the product graph and memory.

```text
cc product <subcommand>
```

## ccep

Run CCEP contract workflows.

```text
cc ccep <subcommand>
```

## openspec

Run the OpenSpec delivery loop.

```text
cc openspec <subcommand>
```

## scorecard

Record and aggregate outcomes.

```text
cc scorecard <subcommand>
```

## orchestrate

Run goal execution orchestration.

```text
cc orchestrate <subcommand>
```

## impact

Analyze change impact.

```text
cc impact [--files <paths>]
```

## verify

Verify task completion with evidence.

```text
cc verify --task <id>
```

## seo

Audit SEO and generate llms.txt.

```text
cc seo audit --url <url>
```

## debt-harvest

Scan source files for deferred debt.

```text
cc debt-harvest
```

