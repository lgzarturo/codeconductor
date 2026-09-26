# Hooks and preset configuration review — 2026-09-25

Scope: agent hooks, Claude permission mode, OpenCode model rendering, native
Antigravity model identifiers, and Pi skill-name diagnostics. Risk: medium.
No dependency additions or changes to users' global configuration.

## Technical plan and verification

1. Match each host's documented stdin/output contract and remove OS-specific
   runner/formatter assumptions; verify with subprocess and policy tests.
2. Resolve requested OpenCode IDs against official docs, the public Go catalog,
   and the installed CLI; render roles using supported settings only.
3. Normalize shipped skill names without changing skill behavior; verify with
   frontmatter tests and Pi's own skill loader. Review, then run the full suite.

## Findings resolved

| Severity | Finding | Correction |
| --- | --- | --- |
| CRITICAL | Claude JSON was treated as Antigravity; real tool commands/paths were not evaluated | Parse `tool_name` / `tool_input`; match read/write tools as well as Bash |
| CRITICAL | Documented Antigravity `toolCall` payload was ignored | Parse `toolCall.name` / `toolCall.args`; include `view_file` in matcher |
| WARNING | Host approval/denial output was inconsistent | Native Claude ask output; Antigravity `decision` / `reason` |
| WARNING | First runner consumed stdin before a fallback | Buffer and replay stdin on every attempt |
| WARNING | Windows executable paths/global Git options/command chains evaded Git policy | Normalize executable invocation and inspect command segments |
| WARNING | Windows separators/case bypassed role-path restrictions | Normalize Windows paths; cover native destructive commands |
| WARNING | npm `.cmd` formatter shims require shell on Windows | Run installed project-local JS bins directly through the runtime |
| WARNING | Claude default bypassed permissions | Set `permissions.defaultMode` to `default` |
| WARNING | Human-readable skill `name` headers violate Pi's rules | Use existing slug IDs and enforce portable names in tests |
| WARNING | Antigravity role/default model names were not native CLI IDs | Use identifiers confirmed by `agy models` |

## Models and compatibility

OpenCode roles are defined in `src/presets/models/roles.yml`, not duplicated in
each target YAML. The four requested Go IDs and role choices are documented in
`presets/opencode/README.md`. Generic temperature and Claude-specific effort
fields are omitted from generated OpenCode agents; provider defaults are used.
Other targets retain their native settings formats.

The installed `opencode` 1.18.32 rejects V2 `permissions`. The preset retains
V1-compatible `permission`, which successfully resolved all 14 agents with the
requested models using `opencode debug config --pure` in an isolated directory.
No authenticated inference or paid model calls were made; successful resolution
does not guarantee account entitlement or regional availability.

## Verification results

- Full Linux suite: 3434 passed, 0 failed across 199 files.
- Typecheck, lint, build, and `git diff --check`: passed.
- Pi 0.85.1 native skill loader: 72 project skills, zero diagnostics.
- The principal workspace also contained 54 old, ignored local skill copies in
  `.claude`, `.codex`, and `.opencode`. Only their `name` headers were normalized;
  their bodies and other local settings were preserved.
- Live OpenCode Go catalog and `opencode models opencode-go`: all four IDs found.
- `agy models` 1.2.7: corrected native IDs found.
- Runner-captured RED/GREEN evidence retained in the temporary implementation
  worktree; focused regression tests are part of the repository.
- CI now includes Linux/macOS/Windows hook tests. macOS/Windows have not been
  executed in this Linux workspace; their matrix results remain pending.

## Residual warnings

- Hooks still fail open when every runner is unavailable; this existing policy
  is preserved. Host permissions must remain enabled. Hooks are not a sandbox.
- Command inspection is intentionally not a complete shell-language parser.
- Muse Contributor trains on prompts/completions, is not ZDR, and has regional
  restrictions. It is included because the maintainer explicitly requested it.
- Global/project `find-skills` collision is separate from invalid names. Pi keeps
  the first discovered skill; the user's global copy was not removed.
- Graphify is not installed and no knowledge graph is present in this workspace.

## Sources

- [Claude hook contracts](https://code.claude.com/docs/en/hooks)
- [Antigravity hook contracts](https://antigravity.google/docs/hooks/)
- [Antigravity headless CLI models](https://antigravity.google/docs/cli/headless/)
- [OpenCode V2 model configuration](https://opencode.ai/v2/docs/models/)
- [OpenCode Go IDs and privacy](https://opencode.ai/docs/go/)
- [Pi skill validation](https://pi.dev/docs/latest/skills)
