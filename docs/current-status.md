# Current Product Status

This file is the canonical shipped/planned matrix for the repository.

**Published package version:** `1.0.0` (from `package.json`)

Code present in the repository but assigned to a later release is
**implemented, unreleased**. A release-note filename or historical roadmap
entry does not by itself mean that version was published.

| Capability | Repository status | Published in 0.5.0 |
| ---------- | ----------------- | ------------------- |
| Core CLI (`init`, `detect`, `install`, `doctor`, `update`) | shipped | yes |
| Preset and council installation | shipped | yes |
| SEO audit / `llms.txt` commands | shipped | yes |
| Scorecard and outcome evaluation | shipped | yes |
| Harness ablation (leave-one-out catalog + experiment + report) | implemented, unreleased — **v1.0.0** | no |
| CCEP parse/profile/resolve/compile/validate/evaluate/consensus/taskcard | shipped | yes |
| OpenSpec loop (`validate/scan/plan/status/next/start/done/block/archive` + `/cc-backlog` + `/cc-openspec`) | shipped | yes |
| Product graph, impact, orchestrate, verify | implemented, unreleased — **v1.0.0** | no |
| Goal DAG planning/runtime | implemented, unreleased — **v1.0.0** | no |
| 8-phase `runWorkflowPipeline` | experimental library API | no CLI runtime |
| Stack-specific skill selection | shipped | yes |
| Full stack-specific asset pruning/replacement | planned | no |
| Kotlin LSP binary download | disabled pending pinned URL + SHA-256 | no |
| Policy compiler / uniform target enforcement | planned | no |

## Help contracts

- `codeconductor help` and `--help`: general CLI usage and command list.
- `codeconductor cc-help`: installed preset inventory for a runner target.
  Inventory is no longer available via `help --target` (breaking vs older docs
  that treated `help` and `cc-help` as aliases).

## Release documentation

The next documented release is **v1.0.0** (Product OS). Historical notes for
0.4.0 and 0.5.0 remain in `docs/v0.4.0-release-notes.md` and
`docs/v0.5.0-release-notes.md`.

- [docs/v1.0.0-release-notes.md](v1.0.0-release-notes.md) — draft for the
  Product OS surface while the published package version is `1.0.0`

## TaskCard shapes

Canonical TaskCard is the source of truth for **delivery** intake (`ccep taskcard`).
OpenSpec cards remain a **phase view** (`phase`, `backlogId`, `prompt`, `agent`) and
are not collapsed into Canonical. The experimental pipeline `TaskCard` is a derived
view: Canonical ↔ Pipeline round-trips without dropping `id`, `status`, or
`scope.out` (boundaries).

Council consensus is gated with `ccep consensus --input @verdicts.json` (exit
0/1/2 = APPROVED/REJECTED/ESCALATED). There is no top-level `cc council` command.
