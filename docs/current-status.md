# Current Product Status

This file is the canonical shipped/planned matrix for the repository.

**Published package version:** `0.5.0` (from `package.json`)

Code present in the repository but assigned to a later release is
**implemented, unreleased**. A release-note filename or historical roadmap
entry does not by itself mean that version was published.

| Capability | Repository status | Published in 0.5.0 |
| ---------- | ----------------- | ------------------- |
| Core CLI (`init`, `detect`, `install`, `doctor`, `update`) | shipped | yes |
| Preset and council installation | shipped | yes |
| SEO audit / `llms.txt` commands | shipped | yes |
| Scorecard and outcome evaluation | shipped | yes |
| CCEP parse/profile/resolve/compile/validate/evaluate | shipped | yes |
| OpenSpec loop (`openspec` CLI + `/cc-openspec`) | shipped | yes |
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

- [docs/v1.0.0-release-notes.md](v1.0.0-release-notes.md) — draft while
  `package.json` remains `0.5.0`
