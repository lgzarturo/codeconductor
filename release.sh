#!/usr/bin/env bash
set -euo pipefail

function usage() {
  cat <<EOF
Usage: ./release.sh <version-type> [--skip-tests] [--dry-run]

Version types: patch | minor | major

Options:
  --skip-tests  Skip test and typecheck validation
  --dry-run      Show what would happen without making changes

Examples:
  ./release.sh patch          # 0.2.0 → 0.2.1
  ./release.sh minor          # 0.2.0 → 0.3.0
  ./release.sh major          # 0.2.0 → 1.0.0
EOF
  exit 1
}

SKIP_TESTS=false
DRY_RUN=false
VERSION_TYPE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-tests) SKIP_TESTS=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    patch|minor|major)
      if [[ -n "$VERSION_TYPE" ]]; then
        echo "Error: only one version type allowed"
        usage
      fi
      VERSION_TYPE="$1"; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$VERSION_TYPE" ]]; then
  echo "Error: version type required"
  usage
fi

PACKAGE_JSON="package.json"
VERSION_FILE="VERSION"
CURRENT_VERSION=$(node -p "require('./$PACKAGE_JSON').version")
VERSION_FILE_VALUE=$(tr -d '[:space:]' < "$VERSION_FILE")
if [[ "$CURRENT_VERSION" != "$VERSION_FILE_VALUE" ]]; then
  echo "Error: package.json ($CURRENT_VERSION) and $VERSION_FILE ($VERSION_FILE_VALUE) are out of sync"
  exit 1
fi
RELEASE_DOCS=(
  "README.md"
  "docs/cc-commands.md"
  "docs/current-status.md"
  "docs/current-limitations.md"
  "docs/architecture.md"
)

function log() { echo "[release] $*"; }
function dry_log() { echo "[DRY-RUN] $*"; }

function command_exists() {
  command -v "$1" &>/dev/null
}

NEW_VERSION=$(node -p "
const v = require('./$PACKAGE_JSON').version.split('.').map(Number);
const t = '$VERSION_TYPE';
if (t === 'major') { v[0]++; v[1] = 0; v[2] = 0; }
else if (t === 'minor') { v[1]++; v[2] = 0; }
else { v[2]++; }
v.join('.');
")

if [[ "$DRY_RUN" == "true" ]]; then
  dry_log "Package version: $CURRENT_VERSION"
  dry_log "New version: $NEW_VERSION"
  dry_log "Version file: $VERSION_FILE"
  dry_log "Release documentation: ${RELEASE_DOCS[*]}"
  dry_log "Version bump: $VERSION_TYPE"
  dry_log "Would run: npm test && npm run typecheck"
  dry_log "Would synchronize release documentation"
  dry_log "Would generate CHANGELOG via git-cliff"
  dry_log "Would commit: 'chore(release): bump to v<new-version>'"
  dry_log "Would create git tag: v<new-version>"
  dry_log "Run without --dry-run to execute"
  exit 0
fi

log "Starting release process"
log "Current version: $CURRENT_VERSION"
log "Bump type: $VERSION_TYPE"

if [[ "$SKIP_TESTS" == "false" ]]; then
  log "Running tests..."
  npm test
  log "Running typecheck..."
  npm run typecheck
fi

log "New version: $NEW_VERSION"

NEW_VERSION="$NEW_VERSION" node <<'NODE'
const fs = require('fs');
const newVersion = process.env.NEW_VERSION;
const packageJsonPath = 'package.json';

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
pkg.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
NODE
bun run scripts/sync-release-docs.ts "$NEW_VERSION"
printf '%s\n' "$NEW_VERSION" > "$VERSION_FILE"

log "Building..."
npm run build

if ! command_exists git-cliff; then
  log "WARN: git-cliff not installed"
  log "Install: brew install git-cliff (macOS) or cargo install git-cliff"
  log "Skipping CHANGELOG generation"
else
  log "Generating CHANGELOG..."
  # Workaround for libgit2 bug: git-cliff fails if .git/commondir contains '.'
  if [[ -f .git/commondir ]] && grep -q '^.$' .git/commondir; then
    rm -f .git/commondir
  fi
  env -u GIT_DIR -u GIT_WORK_TREE git-cliff --workdir "$PWD" --repository "$PWD" --config .cliff.toml --output CHANGELOG.md
  git add CHANGELOG.md
fi

git add "$PACKAGE_JSON" "$VERSION_FILE" "${RELEASE_DOCS[@]}"
git commit -m "chore(release): bump to v$NEW_VERSION"
git tag "v$NEW_VERSION"

log "Release v$NEW_VERSION prepared successfully"
log ""
log "Next steps:"
log "  1. git push origin main --tags"
log "  2. npm publish --access public"
log "  3. Create GitHub release with CHANGELOG.md contents"
