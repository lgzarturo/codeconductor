# Deploy CodeConductor

Guide for publishing CodeConductor as an npm package and creating GitHub
releases.

## Prerequisites

- Node.js >= 20.11
- npm or bun
- [git-cliff](https://git-cliff.org/) for CHANGELOG generation
- npm account with 2FA configured (recommended)
- GitHub repository with push access

### Install git-cliff

```bash
# macOS
brew install git-cliff

# Linux
cargo install git-cliff

# Or download from releases: https://github.com/orhun/git-cliff/releases
```

## Package Preparation

Verify the `bin` entry is correctly configured in `package.json`:

```json
{
  "name": "cc-codeconductor",
  "version": "0.2.0",
  "bin": {
    "cc-codeconductor": "./dist/index.js",
    "codeconductor": "./dist/index.js"
  }
}
```

The package will be available as `npx cc-codeconductor` after publication. The
installed CLI commands are `cc-codeconductor` and the legacy `codeconductor`
alias.

## Release Process

### Quick Release (Automated)

Use the release script for automated version bumping:

```bash
# Patch release: 0.2.0 → 0.2.1
npm run release:patch

# Minor release: 0.2.0 → 0.3.0
npm run release:minor

# Major release: 0.2.0 → 1.0.0
npm run release:major
```

The script will:

1. Run tests and typecheck
2. Build the project (`npm run build`)
3. Generate CHANGELOG.md via git-cliff
4. Bump version in package.json
5. Create a git commit and tag

### Skip Tests (Emergency)

```bash
./release.sh patch --skip-tests
```

### Dry Run

Preview what would happen without making changes:

```bash
./release.sh patch --dry-run
```

## After Release Script

### 1. Push Changes

```bash
git push origin main --tags
```

### 2. Publish to npm

```bash
npm login
npm publish --access public
```

**Important:** If your npm account has 2FA enabled, you'll need to provide an
OTP:

```bash
npm publish --access public --otp=123456
```

### 3. Verify Publication

```bash
npm view cc-codeconductor
npx cc-codeconductor --version
```

## Manual Release Process

If you prefer manual control or the release script is unavailable:

### Version Bump

Edit `package.json` manually or use npm version:

```bash
# Update version in package.json
npm version patch --no-git-tag-version
```

### Generate CHANGELOG

```bash
git-cliff --config .cliff.toml --output CHANGELOG.md
```

### Commit and Tag

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): bump to v0.2.1"
git tag v0.2.1
git push origin main --tags
```

### Publish

```bash
npm publish --access public --otp=123456
```

## GitHub Release

1. Go to <https://github.com/lgzarturo/codeconductor/releases>
2. Click "Draft a new release"
3. Select the tag (e.g., `v0.2.1`)
4. Copy CHANGELOG.md contents as release notes
5. Add the npm package link: `https://www.npmjs.com/package/cc-codeconductor`
6. Click "Publish release"

## Conventional Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/).
Commit types affect the CHANGELOG:

| Type       | Description             |
| ---------- | ----------------------- |
| `feat`     | New feature             |
| `fix`      | Bug fix                 |
| `perf`     | Performance improvement |
| `refactor` | Code refactoring        |
| `docs`     | Documentation changes   |
| `test`     | Adding/updating tests   |
| `chore`    | Maintenance tasks       |
| `ci`       | CI/CD changes           |

Examples:

```bash
git commit -m "feat(cli): add interactive mode"
git commit -m "fix(agent): resolve memory leak in orchestrator"
git commit -m "docs: update deployment guide"
```

## Troubleshooting

### git-cliff not found

```bash
# Install via cargo
cargo install git-cliff

# Or use brew (macOS)
brew install git-cliff
```

### npm 2FA/OTP issues

1. Ensure 2FA is properly configured on your npm account
2. Use `--otp=XXXXXX` flag with the code from your authenticator
3. Or generate an OTP token: <https://www.npmjs.com/settings/tokens>

### Publish access denied

```bash
# Verify the package name is available
npm view cc-codeconductor

# If scope is needed, check package.json name field
# Must match what's on npmjs.com
```

## Workflow Summary

```
feature → commit (conventional) → code review → merge to main
                                                 ↓
                              release script → npm publish
                                                 ↓
                                         GitHub release
                                               ↓
                                    npx cc-codeconductor
```
