# Harness

The harness is the CodeConductor state installed into a project: configuration,
target files, presets, skill lock data, and installation state. User intent is
kept in `.codeconductor/config.yml`; generated state is kept in
`.codeconductor/install-state.json`.

Its managed files include target instructions, agent roles, commands, skills,
and hook wrappers. Shared skills are authored in `skills/` and selected through
`src/presets/shared-skills.yml`; `bun run sync:skills` generates the declared
preset copies. See [CCHS v1](../harness-spec.md) for target contracts.

Installed state and operational protection are separate checks: `status` shows
installation state, while `doctor` probes whether the hook runner can execute.
After v1.6.1, hooks resolve the installed package; local source/build execution
requires `CC_DEV=1`. Failure blocks pre-tool only when fail-closed is explicitly
enabled. Configuration is documented in [hooks](../hooks.md).

Verification artifacts bind delivery evidence to the candidate observed by the
runner. Keep `.codeconductor/evidence/`, `rdd-receipts/`, and `tdd-validations/`
together when transferring a delivery. The persisted RED record is historical;
GREEN remains current-candidate evidence. These changes are implemented,
unreleased; see [changes after v1.6.1](../post-v1.6.1.md).
