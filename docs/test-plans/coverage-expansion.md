# Test Plan — CodeConductor Coverage Expansion

This test plan defines the testing strategy and scenarios required to increase the test coverage of the CodeConductor codebase to **80–85%**, focusing on the most critical modules: configuration management, filesystem operations, template rendering, and project detection.

### Scope

The scope of this test plan includes:
1. **Configuration Modules**: `config-loader.ts`, `config-writer.ts`, and `codeconductor-config.ts`.
2. **Filesystem Operations**: `safety.ts`, `file-writer.ts`, `safe-merger.ts`, and `path-resolver.ts`.
3. **Generation & Templating**: `template-renderer.ts`, `generator.ts`.
4. **Project Detection & Preset Resolution**: `project-detector.ts`, `preset-resolver.ts`.
5. **Commands Integration**: `init.command.ts`, `install.command.ts`, and `detect.command.ts`.

---

### Unit Tests

These tests cover individual functions and modules in isolation using mocks for filesystem and CLI boundaries.

| Test ID | Target | Scenario | Expected Result |
| ------- | ------ | -------- | --------------- |
| U-101   | `safe-merger.ts` | Merge when managed block markers are present but content is empty | Successfully replaces old managed content with empty block |
| U-102   | `safe-merger.ts` | Merge when multiple begin/end markers exist | Throws a descriptive validation error |
| U-103   | `path-resolver.ts` | Resolve paths inside and outside user workspace | Correctly anchors local workspace paths and throws for paths escaping root |
| U-104   | `template-renderer.ts` | Render template with missing placeholder definitions | Leaves the unresolved placeholders intact or logs a warning |
| U-105   | `template-renderer.ts` | Render templates with complex nested placeholders (e.g. locale variables) | Correctly parses and replaces all matches |
| U-106   | `project-detector.ts` | Confidence calculation with conflicting or minimal signals | Returns correct confidence ('low', 'medium', 'high') according to strict rules |
| U-107   | `preset-resolver.ts` | Resolve preset when stack is unknown | Returns 'unknown' stack but resolves valid generic assets |

---

### Integration Tests

These tests verify the interaction between configurations, filesystem, and resolution layers.

| Test ID | Components | Scenario | Expected Result |
| ------- | ---------- | -------- | --------------- |
| I-201   | `config-loader` & Schema | Load configuration with invalid YAML syntax or schema validation gaps | Gracefully fails, returning a validation failure result |
| I-202   | `config-writer` & FS | Write configuration to a read-only directory or where permissions are denied | Returns a failed result detailing the filesystem error |
| I-203   | `init.command` & Detector | Run `initCommand` on a project with no signals | Returns exit code `3` and reports that no signals were found |
| I-204   | `install.command` & Presets | Run `installCommand` with invalid target (e.g. `invalid-target`) | Throws parser error and returns failure exit code |
| I-205   | `installPresetCommand` & Merger | Run `installPresetCommand` with `--force` on existing files | Overwrites the user files according to manifest strategy rules |

---

### Contract Tests

These tests validate boundary inputs, CLI option shapes, and preset schemas.

| Test ID | Endpoint/Event | Property | Expected Value |
| ------- | -------------- | -------- | -------------- |
| C-301   | CLI arguments | Command options validation (`--target`, `--global`, `--dry-run`) | Successfully parses and enforces correct types and defaults |
| C-302   | Manifest schema | Validate preset manifests (`claude.yml`, `opencode.yml`, `agy.yml`) | Validates target entries and strategies against `InstallManifestSchema` |

---

### Edge Cases

| Test ID | Input/Condition | Expected Behavior |
| ------- | --------------- | ----------------- |
| E-401   | Extremely large `package.json` file during Next.js detection | Gracefully parses without performance lag or timeouts |
| E-402   | Concurrent preset installations on the same workspace | File-system safety locks or merger ensures no partial writes |
| E-403   | Multi-stack project (e.g. Next.js frontend + Django backend in same root) | Frameworks list populated with both; resolution defaults to primary stack |
| E-404   | Monorepo project with workspaces field but empty subfolders | Architecture resolves as 'monorepo' but presets are resolved as single project |

---

### Regression Cases

| Test ID | Reference | Scenario | Must Not Happen |
| ------- | --------- | -------- | --------------- |
| R-501   | Prompts overwrite | User customizations in AGENTS.md outside managed markers | User edits must not be overwritten or lost during `install preset` |
| R-502   | Empty output | CLI command executes with `--output=json` | Errors must be reported in structured JSON format rather than crashing |

---

### Coverage Targets

- **Overall Code Coverage**: **80–85%** of lines, statements, and branches in `src/core/` and `src/commands/`.
- **Unit Tests**: Minimum 15 new test cases.
- **Integration Scenarios**: Minimum 8 new integration test suites.
- **Contract Validations**: Schema schema-validation checks for all 6 target manifests.

---

### Out of Scope

- **Real MCP execution**: Direct connection to third-party MCP endpoints or external LLM API servers.
- **Real IDE integrations**: Verifying auto-attaching of VSCode/Cursor extension installations (stubbed via dry-runs).
