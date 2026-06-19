#!/bin/bash
# Read stdin JSON payload
JSON_INPUT=$(cat)
TOOL_NAME=$(echo "$JSON_INPUT" | jq -r '.toolName')

# Check paths for write/edit/read operations
TARGET_PATH=""
if [[ "$TOOL_NAME" == "write_to_file" || "$TOOL_NAME" == "replace_file_content" || "$TOOL_NAME" == "multi_replace_file_content" ]]; then
  TARGET_PATH=$(echo "$JSON_INPUT" | jq -r '.arguments.TargetFile')
elif [[ "$TOOL_NAME" == "view_file" ]]; then
  TARGET_PATH=$(echo "$JSON_INPUT" | jq -r '.arguments.AbsolutePath')
fi

if [[ ! -z "$TARGET_PATH" ]]; then
  if echo "$TARGET_PATH" | grep -qE '(\.env|secrets/|/\.ssh/|/\.aws/|/\.kube/)'; then
    echo '{"action": "deny", "error": "Blocked: Attempt to access sensitive path"}'
    exit 0
  fi
fi

if [[ "$TOOL_NAME" == "run_command" ]]; then
  COMMAND_LINE=$(echo "$JSON_INPUT" | jq -r '.arguments.CommandLine')

  # 1. Deny patterns
  if echo "$COMMAND_LINE" | grep -qE '(\.env|secrets/|id_rsa|\\.pem|\\.key)\\b' && echo "$COMMAND_LINE" | grep -qE '(cat|less|more|head|tail|cp |mv |scp )'; then
    echo '{"action": "deny", "error": "Blocked: Attempt to read sensitive files"}'
    exit 0
  fi

  if echo "$COMMAND_LINE" | grep -qE '^rm\s+-rf\s+\*' || \
     echo "$COMMAND_LINE" | grep -qE '^sudo\s+' || \
     echo "$COMMAND_LINE" | grep -qE '^git\s+push\s+.*--force' || \
     echo "$COMMAND_LINE" | grep -qE '^git\s+push\s+.*-f' || \
     echo "$COMMAND_LINE" | grep -qE '^git\s+rebase\s+' || \
     echo "$COMMAND_LINE" | grep -qE '^git\s+reset\s+--hard\s+' || \
     echo "$COMMAND_LINE" | grep -qE 'curl\s+.*\s*\|\s*(sh|bash)' || \
     echo "$COMMAND_LINE" | grep -qE 'wget\s+.*\s*\|\s*(sh|bash)' || \
     echo "$COMMAND_LINE" | grep -qE '^chmod\s+777\s+' || \
     echo "$COMMAND_LINE" | grep -qE '^dd\s+' || \
     echo "$COMMAND_LINE" | grep -qE '^mkfs\s+'; then
    echo '{"action": "deny", "error": "Blocked: Command violated security policy"}'
    exit 0
  fi

  # 2. Ask patterns
  if echo "$COMMAND_LINE" | grep -qE '^git\s+commit\s*' || \
     echo "$COMMAND_LINE" | grep -qE '^git\s+checkout\s*' || \
     echo "$COMMAND_LINE" | grep -qE '^git\s+switch\s*' || \
     echo "$COMMAND_LINE" | grep -qE '^docker\s+compose\s*'; then
    echo '{"action": "ask"}'
    exit 0
  fi
fi

# Default: allow
echo '{"action": "allow"}'
