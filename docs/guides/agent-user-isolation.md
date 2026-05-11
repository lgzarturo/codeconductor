# Agent Execution Isolation: Dedicated OS Users

**Framework version:** CodeConductor v0.1.0  
**Applies to:** Claude Code, OpenCode, OpenAI Codex  
**Platforms:** POSIX (Linux/macOS), Windows 11

This guide explains how to run AI agents under a dedicated OS user so they
cannot access your primary user's home directory, SSH keys, `.env` files, or
environment variables. It combines OS-level identity isolation with in-tool
guardrails for defense in depth.

> [!IMPORTANT] This guide documents the isolation techniques that are available
> today. CodeConductor does not provide a runtime sandbox or automated isolation
> setup in v0.1.0. Every step here is a manual operation you perform once per
> machine.

---

## 1. The Isolation Model

Effective isolation has three independent layers. Each layer catches what the
others miss.

| Layer          | Mechanism                              | What it stops                                           |
| -------------- | -------------------------------------- | ------------------------------------------------------- |
| **Identity**   | Dedicated OS user with no admin rights | Access to your HOME, SSH keys, user-level env vars      |
| **Guardrails** | Tool-level deny rules in config files  | Agents reading sensitive paths even if the OS allows it |
| **Session**    | Git Worktree per agent session         | Agents modifying your main working tree directly        |

Apply all three. Relying on only one layer assumes the others never fail.

---

## 2. Prerequisites

Before starting, verify the following:

- You have administrator or `sudo` access on the machine (needed to create the
  new user)
- The agent tools you plan to use are installed and working under your primary
  user
- Your project directory is under version control with a clean working tree

```bash
git status    # should report "nothing to commit, working tree clean"
```

---

## 3. POSIX: Linux and macOS

### 3.1 Create the dedicated agent user

Create a system user named `cc-agent` (or any name you prefer). Use a name that
makes the purpose obvious — it will appear in process listings and audit logs.

**Linux:**

```bash
sudo useradd -m cc-agent
sudo passwd -l cc-agent    # lock password — no interactive login
```

**macOS:**

```bash
sudo sysadminctl -addUser cc-agent -fullName "CC Agent" -shell /bin/bash
sudo dseditgroup -o edit -a cc-agent -t user com.apple.access_disabled
```

The `-l` flag (Linux) and `access_disabled` group (macOS) prevent the account
from being used for interactive login. The agent is always launched via `sudo`,
not by switching sessions.

### 3.2 Restrict your primary HOME directory

Tighten permissions on your home directory so `cc-agent` cannot read it even if
the OS allows cross-user reads by default.

```bash
chmod 700 /home/your-username        # Linux
chmod 700 /Users/your-username       # macOS
```

Verify the change:

```bash
ls -ld /home/your-username
# expected: drwx------ ...
```

After this change, any process running as `cc-agent` that attempts to read files
under `/home/your-username` will receive `Permission denied`.

### 3.3 Grant the agent user access to the project directory only

Give `cc-agent` read and write access to the specific project it needs to work
on, without granting access to your entire home.

```bash
# Grant access to one project
sudo setfacl -R -m u:cc-agent:rwx /path/to/your-project   # Linux (ACL)

# macOS alternative — add cc-agent to a project-specific group
sudo chmod -R g+rwx /path/to/your-project
sudo chgrp -R staff /path/to/your-project
sudo dseditgroup -o edit -a cc-agent -t user staff
```

If `setfacl` is not available, move the project directory outside your HOME
(e.g., `/srv/projects/myapp`) and set permissions with `chown` and `chmod`.

### 3.4 Launch agents under the isolated user

Use `sudo -u` to run the agent as `cc-agent`. The process inherits a clean
environment — no `HOME` secrets, no user-level environment variables from your
session.

**Claude Code:**

```bash
sudo -u cc-agent claude
```

**OpenCode:**

```bash
sudo -u cc-agent opencode
```

**Codex:**

```bash
sudo -u cc-agent codex
```

To open a full shell as `cc-agent` for longer sessions:

```bash
sudo -u cc-agent -i
```

The `-i` flag simulates a login shell, giving `cc-agent` its own environment
(based on its own `.bashrc` or `.zshrc`, not yours).

---

## 4. Windows 11

### 4.1 Create a standard local account

1. Open **Settings → Accounts → Other users**
2. Select **Add account**
3. Choose **I don't have this person's sign-in information**
4. Choose **Add a user without a Microsoft account**
5. Set the username (e.g., `cc-agent`) and a strong password
6. Leave the account type as **Standard User** — do not promote to Administrator

Verify the account type in **Settings → Accounts → Other users**: it should show
**Standard User**, not **Administrator**.

### 4.2 Verify HOME directory isolation

Windows isolates user profiles by default. The folder `C:\Users\cc-agent` is
created when the account first logs in. Your primary profile at
`C:\Users\your-username` is not readable by `cc-agent` as long as you have not
changed the default ACLs.

Verify from an elevated PowerShell prompt:

```powershell
# Check ACL on your profile — cc-agent should not appear
Get-Acl "C:\Users\your-username" | Format-List
```

If `cc-agent` appears in the ACL, remove the entry:

```powershell
$acl = Get-Acl "C:\Users\your-username"
$acl.Access | Where-Object { $_.IdentityReference -like "*cc-agent*" } |
  ForEach-Object { $acl.RemoveAccessRule($_) }
Set-Acl "C:\Users\your-username" $acl
```

### 4.3 Launch agents under the isolated user

Use `runas` to start a terminal as `cc-agent`. The resulting shell inherits
`cc-agent`'s environment — no environment variables from your primary session
are visible.

```powershell
runas /user:cc-agent powershell
```

You will be prompted for `cc-agent`'s password. The new PowerShell window runs
entirely as `cc-agent`.

From that shell, launch the agent normally:

```powershell
claude        # Claude Code
opencode      # OpenCode
codex         # Codex
```

> [!NOTE] The agent tools must be installed and accessible in `cc-agent`'s PATH.
> If you installed them for your primary user only, reinstall them for
> `cc-agent` or place the binaries in a system-wide location such as
> `C:\Program Files\`.

---

## 5. Guardrail Configuration Per Tool

OS-level isolation stops the agent from accessing your files. Guardrails stop
the agent from asking the tool to access sensitive paths even when the OS would
permit it. Configure both.

### 5.1 Claude Code — `settings.json`

Place deny rules in `~/.claude/settings.json` (user-global) or
`.claude/settings.json` (project-level). Deny rules have absolute priority —
they override any allow rule.

```json
{
  "permissions": {
    "deny": [
      "Read(~/.ssh/*)",
      "Read(~/.zshrc)",
      "Read(~/.bashrc)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Bash(sudo *)",
      "Bash(rm -rf /)",
      "Bash(curl * | sh)",
      "Bash(git push --force*)",
      "Bash(git push -f*)"
    ]
  }
}
```

Place this file in `cc-agent`'s home directory at `~/.claude/settings.json` so
the rules apply to every project the agent touches.

### 5.2 OpenCode — `opencode.json`

OpenCode uses `opencode.json` at project root or
`~/.config/opencode/opencode.json` globally. Disable tool access to sensitive
files and network access where not needed.

```json
{
  "permissions": {
    "deny": [
      "Read(~/.ssh/*)",
      "Read(./.env)",
      "Bash(sudo *)",
      "Bash(rm -rf *)"
    ]
  }
}
```

Place this in `cc-agent`'s global config path so it applies across all projects.

### 5.3 Codex — `config.toml`

Codex uses TOML format at `~/.codex/config.toml`. Refer to the Codex
documentation for the exact deny-rule syntax — the format varies by version and
the path-blocking feature may require a minimum version. At minimum, avoid
running Codex with access to paths outside the project directory.

---

## 6. Environment Variable Isolation

Agents inherit environment variables from the process that launches them. A
secret loaded in your shell (via `source .env` or `export API_KEY=...`) is
visible to any child process, including agents.

**Isolation strategies:**

- **Use a dedicated user (primary recommendation).** `cc-agent` starts with a
  clean environment — none of your user-level variables are present.

- **Do not source secrets before launching an agent.** If you must work in your
  primary user's session, open a fresh terminal tab, do not load any secrets,
  and launch the agent from there.

- **Use managed policies for team environments.** Place configuration in
  system-level paths that `cc-agent` can read but users cannot modify:
  - Linux/macOS: `/etc/claude-code/managed-mcp.json`
  - macOS (OpenCode): `/Library/Application Support/opencode/`

  Managed policies fix the agent's security boundaries at the OS level,
  preventing any user-level config from overriding them.

---

## 7. Git Worktree Session Isolation

Even with a dedicated user, agents should not work directly on your main branch.
Use Git Worktrees to give each agent session its own physical copy of the
repository.

### 7.1 Claude Code — worktree isolation

Set `isolation: worktree` in an agent definition file
(`.claude/agents/your-agent.md`):

```yaml
---
name: feature-agent
description: "Isolated agent for experimental feature work"
isolation: worktree
---
```

Claude Code creates a temporary worktree automatically when this agent is
invoked. If the agent makes no changes, the worktree is deleted on completion.
If changes exist, the worktree is preserved for you to review and merge.

### 7.2 Manual worktree workflow (any tool)

For tools without built-in worktree support, create and use a worktree manually:

```bash
# Create a worktree for the agent session
git worktree add ../myproject-agent-session feature/new-thing

# Launch the agent pointed at the worktree
cd ../myproject-agent-session
sudo -u cc-agent claude    # or opencode, or codex
```

After the session ends:

```bash
# Review changes in the worktree
git diff main..feature/new-thing

# Merge if acceptable
git merge feature/new-thing

# Remove the worktree
git worktree remove ../myproject-agent-session
```

---

## 8. Verification Checklist

Run this checklist after completing setup. Every item must pass before trusting
the isolation.

**POSIX:**

```bash
# cc-agent cannot read your HOME
sudo -u cc-agent ls /home/your-username
# expected: ls: cannot open directory '/home/your-username': Permission denied

# cc-agent can read the project directory
sudo -u cc-agent ls /path/to/your-project
# expected: project files listed

# cc-agent cannot read SSH keys
sudo -u cc-agent cat ~/.ssh/id_rsa
# expected: Permission denied

# Agent launches under cc-agent identity
sudo -u cc-agent claude --version
# expected: version string (no permission errors)
```

**Windows 11:**

```powershell
# From a shell running as cc-agent:

# Cannot read primary user's profile
Get-ChildItem "C:\Users\your-username"
# expected: Access denied

# Can read the project directory
Get-ChildItem "C:\path\to\your-project"
# expected: project files listed

# Agent launches
claude --version
# expected: version string
```

**Deny rules (all platforms):**

Start the agent as `cc-agent`, then ask it to read a protected path. It should
refuse without prompting the OS at all:

```text
Read the contents of ~/.ssh/id_rsa
```

Expected: the agent declines with a permission denial from its own config,
before the OS is even consulted.

---

## 9. What Not to Do

**Do not run agents as your primary user with no guardrails.** The agent
inherits everything you have access to — secrets, SSH keys, and the ability to
modify any file you own.

**Do not give `cc-agent` administrator or `sudo` access.** An agent running with
elevated privileges can undo every restriction in this guide.

**Do not source `.env` or load secrets before launching an agent.** Environment
variables set in a shell are inherited by child processes.

**Do not skip the deny rules.** OS isolation stops the agent from accessing
files the OS blocks. Deny rules stop it from even attempting to access paths
that the OS would allow (e.g., files inside the project directory you
deliberately shared with `cc-agent`).

**Do not work directly on your main branch from the agent.** Use a worktree.
Even a well-intentioned agent can make changes that are hard to unpick from an
active branch.

**Do not store secrets inside the project directory the agent can access.** Keep
secrets in a secrets manager outside the agent's reachable path.

---

## 10. Defense-in-Depth Summary

Apply all three layers. Each one is independently necessary.

| Layer          | POSIX                                                                        | Windows 11                                        |
| -------------- | ---------------------------------------------------------------------------- | ------------------------------------------------- |
| **Identity**   | `useradd cc-agent`, `chmod 700 ~/`                                           | Standard local account, default profile ACLs      |
| **Guardrails** | Deny rules in `~/.claude/settings.json` (Claude), `opencode.json` (OpenCode) | Same config files, placed in `cc-agent`'s profile |
| **Session**    | `git worktree add` or `isolation: worktree` in agent definition              | Same                                              |

If you can only apply one layer, apply **Identity**. It is the hardest to
bypass. The other layers add precision and defense against misconfiguration.
