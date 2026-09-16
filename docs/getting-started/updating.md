# Updating safely

`cc update` reconciles the installed harness with the CLI currently running.
It records SHA-256 baselines in `.codeconductor/install-state.json` and never
overwrites a locally changed managed preset without `--force`.

```bash
cc update --check
npx cc-codeconductor@latest update --dry-run
npx cc-codeconductor@latest update
```

When a managed YAML file changed locally, resolve the conflict manually or use
`--force` only when replacing it is intentional. Updates back up planned files
and roll them back if application or the post-update diagnostic fails.
