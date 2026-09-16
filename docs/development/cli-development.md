# CLI development

This document is for maintainers. Use the local source entrypoint while
developing:

```bash
bun run dev help
bun run build
```

Do not use `npx cc-codeconductor` to test unpublished source changes. The CLI
reference is generated from `src/cli/command-registry.ts` with:

```bash
bun run generate:cli-docs
```
