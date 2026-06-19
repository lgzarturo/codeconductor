#!/bin/bash
# Read stdin JSON payload
JSON_INPUT=$(cat)
TOOL_NAME=$(echo "$JSON_INPUT" | jq -r '.toolName')

if [[ "$TOOL_NAME" == "write_to_file" || "$TOOL_NAME" == "replace_file_content" || "$TOOL_NAME" == "multi_replace_file_content" ]]; then
  FILE_PATH=$(echo "$JSON_INPUT" | jq -r '.arguments.TargetFile')
  if [ -f "$FILE_PATH" ]; then
    # Run Prettier
    if echo "$FILE_PATH" | grep -qE '\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|mdx|css|scss|html|astro|yaml|yml)$'; then
      npx --no-install prettier --write "$FILE_PATH" 2>/dev/null || true
    fi
    # Run ESLint
    if echo "$FILE_PATH" | grep -qE '\.(ts|tsx|js|jsx|mjs|cjs)$'; then
      npx --no-install eslint --fix "$FILE_PATH" 2>/dev/null || true
    fi
    # Run Ruff (Python)
    if echo "$FILE_PATH" | grep -qE '\.py$'; then
      ruff format "$FILE_PATH" 2>/dev/null && ruff check --fix "$FILE_PATH" 2>/dev/null || true
    fi
  fi
fi

# Return an empty JSON object to stdout
echo "{}"
