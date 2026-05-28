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
CURRENT_VERSION=$(node -p "require('./$PACKAGE_JSON').version")
REPO_URL=$(node -p "require('./$PACKAGE_JSON').repository.url" 2>/dev/null || echo "")

function log() { echo "[release] $*"; }
function dry_log() { echo "[DRY-RUN] $*"; }

function command_exists() {
  command -v "$1" &>/dev/null
}

if [[ "$DRY_RUN" == "true" ]]; then
  dry_log "Package version: $CURRENT_VERSION"
  dry_log "Version bump: $VERSION_TYPE"
  dry_log "Would run: npm test && npm run typecheck"
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

NEW_VERSION=$(node -p "
const v = require('./$PACKAGE_JSON').version.split('.').map(Number);
const t = '$VERSION_TYPE';
if (t === 'major') { v[0]++; v[1] = 0; v[2] = 0; }
else if (t === 'minor') { v[1]++; v[2] = 0; }
else { v[2]++; }
v.join('.');
")

log "New version: $NEW_VERSION"

node -p "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\n');
"

log "Building..."
npm run build

if ! command_exists git-cliff; then
  log "WARN: git-cliff not installed"
  log "Install: brew install git-cliff (macOS) or cargo install git-cliff"
  log "Skipping CHANGELOG generation"
else
  log "Generating CHANGELOG..."
  git-cliff --config .cliff.toml --output CHANGELOG.md
  git add CHANGELOG.md
fi

git add "$PACKAGE_JSON"
git commit -m "chore(release): bump to v$NEW_VERSION"
git tag "v$NEW_VERSION"

log "Release v$NEW_VERSION prepared successfully"
log ""
log "Next steps:"
log "  1. git push origin main --tags"
log "  2. npm publish --access public"
log "  3. Create GitHub release with CHANGELOG.md contents"
