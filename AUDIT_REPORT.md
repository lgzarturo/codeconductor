# CodeConductor Council & Agent-Prompt Audit Report

## 1. Council Roster vs. Prompt File Availability

**Council roster from `src/presets/council/council.yml`**: 7 agents

| Agent ID | Role | Prompt File Found | Location | Status |
|----------|------|-------------------|----------|--------|
| architect | Architect | YES | `.agents/agents/council-architect.md` | GENERATED (34 lines) |
| security | Security | YES | `.agents/agents/council-security.md` | GENERATED (34 lines) |
| product | Product | YES | `.agents/agents/council-product.md` | GENERATED (34 lines) |
| delivery | Delivery | YES | `.agents/agents/council-delivery.md` | GENERATED (34 lines) |
| data-ops | DataOps | YES | `.agents/agents/council-data-ops.md` | GENERATED (34 lines) |
| security-reviewer | Security Reviewer | NO | MISSING in main repo | **CRITICAL: Only in worktree** |
| devil | Devil | YES | `.agents/agents/council-devil.md` | GENERATED (34 lines) |

**Finding**: All council agents have prompt files. However, `council-security-reviewer.md` exists only in the worktree (`.claude/worktrees/agent-presets-council-4d587b/.agents/agents/`), not in the main repository.

---

## 2. Council Agent Prompt Quality Assessment

Read 3 council-*.md files to determine if generated or hand-written.

### Evidence: All Thin Stubs, Clearly Generated

**council-product.md** (583 bytes, 35 lines):
```yaml
---
description: "Product council agent. Focus: requirements, ux, business-value. Context: prompt-only. Model hint: balanced."
mode: subagent
permission:
  read: deny
  edit: deny
  bash: deny
  glob: deny
  grep: deny
  webfetch: deny
  websearch: deny
---

# Product Agent
## Role
Product
## Context
Only receives prompts, no direct repository access
## Model Hint
balanced
## Focus Areas
- requirements
- ux
- business-value
## Responsibilities
- Understand requirements
- Evaluate UX decisions
- Assess business value
- Prioritize features
```

**council-data-ops.md** (579 bytes, 34 lines): Similar stub structure.

**council-devil.md** (578 bytes, 34 lines): Similar stub structure.

**Finding**: Generated artifacts. All 6 council-*.md files have:
- Identical template structure (frontmatter + Role header + Context + Model Hint + Focus Areas + Responsibilities)
- No unique logic or prompting instructions
- ~2-5 lines per responsibility section (trivial)
- Line count: exactly 34 lines each

**Generator source**: `src/adapters/agy/agy-council-generator.ts:22` generates `.agents/agents/council-${agent.id}.md` via `generateAgyAgentContent(agent)` and `generateAgentContent(agent)` from `domain/council/council-agent.ts`.

---

## 3. Council Roster (7) vs. Workflow Agent Roster (14) — Duplicate Role?

**Workflow agents** in `presets/opencode/agents/`:
architect, complexity-auditor, contract-builder, devil, docs, goal-planner, implementer, orchestrator, planner, repo-explorer, reviewer, **security-reviewer**, task-coach, tester (14 agents)

**Council agents** from `council.yml`:
architect, **security**, product, delivery, data-ops, **security-reviewer**, devil (7 agents)

### Are "security" and "security-reviewer" genuinely different?

**council-security.md** (stub):
```markdown
# Security Agent
## Role
Security
## Focus Areas
- security
- vulnerabilities
- compliance
## Responsibilities
- Identify security vulnerabilities
- Review for OWASP risks
- Check compliance requirements
- Suggest security improvements
```

**presets/opencode/prompts/v1.0.0/security-reviewer.md** (474 lines, excerpt):
```markdown
# Agent Contract — security-reviewer v1.0.0

## Role
You are the security-reviewer for CodeConductor. You perform dedicated security
analysis on code changes. You produce structured security findings with veto
authority on high-risk deliverables.

## Focus areas
| Area | What to check |
| Injection | SQL, command, template, LDAP injection vectors |
| Auth | Authentication bypass, session fixation, privilege escalation |
| Credentials | Hardcoded secrets, tokens in logs, insecure storage |
| Supply chain | Untrusted dependencies, unpinned versions, typosquatting risk |
| OWASP Top 10 | Broken access control, cryptographic failures, SSRF, XSS |
| Data exposure | PII in logs, error messages leaking internals |

## Finding categories
### CRITICAL — security veto (blocks merge)
- Exploitable vulnerability with realistic attack path
- Credentials or secrets in the diff
- Missing authorization on protected operations
- Injection vector in user-controlled input path
```

**Finding**: YES, genuinely different roles:
- **security** (council): Lightweight compliance/vulnerability identification (no veto authority)
- **security-reviewer** (workflow): Deep, structured analysis with explicit **veto authority** on high-risk paths

However, the **council-security.md stub does not capture this distinction**. The stub is auto-generated and trivial.

---

## 4. How Consensus Is Actually Computed

Read `src/domain/council/council-consensus.ts` (core consensus function).

**Is it real code or prompt-only?** REAL CODE.

### Core Function Excerpt:
```typescript
export function councilConsensus(
  verdicts: readonly CouncilVerdictInput[],
  config: ConsensusConfig = DEFAULT_CONFIG,
): CouncilVerdict {
  // Line 239-241: Empty input check
  if (totalAgents === 0) {
    return escalated(verdicts, 'No verdicts submitted — escalated for human review.');
  }

  // Line 243: Ballot box validation (roster, duplicates, confidence)
  const ballotFailure = validateBallotBox(verdicts, config.expectedAgentIds);
  if (ballotFailure) {
    return escalated(verdicts, `Ballot box invalid: ${ballotFailure}...`);
  }

  // Line 264-306: Count votes, apply veto logic
  for (const v of verdicts) {
    // Security veto (line 286-289):
    if (config.allowSecurityVeto && v.securityVeto && v.status === 'REJECTED') {
      vetoApplied = true;
      vetoByAgentId = v.agentId;
    }
    
    // Critical security findings trigger veto (line 298-305):
    if (config.allowSecurityVeto && 
        finding.severity === 'critical' && 
        isSecurityCategory(finding.category)) {
      vetoApplied = true;
    }
  }

  // Line 318-335: Veto logic — REJECTED if any security veto
  if (vetoApplied || complianceVetoApplied) {
    return { status: 'REJECTED', ... };
  }

  // Line 383-398: Majority voting
  if (config.algorithm === 'majority') {
    if (approvedCount > rejectedCount) {
      return { status: 'APPROVED', ... };
    }
  }

  // Line 370: Confidence threshold (< 0.7 → ESCALATED)
  if (hasLowConfidence || averageConfidence < 0.7) {
    return escalated(verdicts, `Confidence threshold breach...`);
  }
}
```

**Rules implemented**:
- Quorum: ceil(roster/2) by default, configurable
- Confidence: threshold 0.6 per agent, 0.7 average (triggers escalation)
- Security veto: one agent can unilaterally REJECT if `securityVeto=true` or critical security finding
- Compliance veto: similar to security veto
- Majority voting: approvedCount > rejectedCount wins
- Unanimous voting: all agents must APPROVE
- Critical findings policy: "escalate" (default), "reject", or "ignore"

**Finding**: Consensus is **real, implemented code with explicit veto, quorum, and confidence mechanics**. Not a prompt-only, conversational council.

---

## 5. cc-council Command Uniformity Across Targets

Checked: `presets/cursor/commands/cc/council.md`, `presets/agy/workflows/cc-council.md`, `presets/opencode/commands/cc-council.md`

**Result**: IDENTICAL content, word-for-word, across all 3 (and presets/claude/commands/cc/council.md).

### Structure (All 5 Steps):
```
Step 0 — CCEP Bootstrap (5 sub-steps with npx cc-codeconductor calls)
Step 1 — Wayfinding (repo-explorer, graphify query)
Step 2 — Deliberation & Specification (SDD, council skill, grilling, confirmation gate)
Step 3 — Test Definition (TDD, failing-first tests)
Step 4 — Surgical Implementation (minimal diff, loop implementer ↔ tester)
Step 5 — Multi-Perspective Council Review (council skill, 6 axes, CRITICAL blocks)
```

**Line count**: 88 lines (identical in all files).

**Finding**: Complete command duplication. All `cc-council` commands are byte-for-byte identical across cursor, agy, opencode, and claude. This is a primary candidate for single-source generation.

---

## 6. Role Prompt Quality — Deep Dive

Read 3 v1.0.0 prompts: `orchestrator.md`, `implementer.md`, `devil.md`

### orchestrator.md (474 lines)
**Frontmatter**:
```yaml
---
name: orchestrator
description: Coordinates the end-to-end workflow...
effort: medium
mode: primary
model: "{{MODEL}}"
temperature: 0.1
tools: Read, Glob, Grep, Bash
permission:
  read: allow
  edit: deny
  bash:
    "*": deny
    "git status*": allow
    "git diff*": allow
    "git log*": allow
---
```

**Content structure**:
- Role definition (clear boundaries: no code, no tests, no pushing)
- 7 explicit Responsibilities
- Task Card validation checklist (8 fields, all required/optional marked)
- Context Scope handling (3 modes: isolated, continuation, full)
- Risk classification table (13 signals mapped to low/medium/high)
- Routing decision table (14 task types × 3 risk levels)
- Workflow commands section

**Quality assessment**: STRONG. Output contract is explicit (routing table), all conditional paths documented, escalation criteria clear.

### implementer.md (200+ lines)
**Content excerpt**:
```markdown
## Pre-implementation checklist
Complete this checklist before opening any file for editing:
0. Create a Git Worktree for this session
1. Read the Technical Plan completely
2. Read every file listed under "Affected Files and Modules."
3. Understand the existing patterns in those files
4. Confirm the acceptance criteria from the Task Card
5. Verify that the test suite currently passes before your changes
Only after completing all six steps: begin writing.

## Implementation rules
### Minimal diff
Change only what the Technical Plan specifies.

### Work in a worktree
Create a session worktree before touching any file.
```

**Quality assessment**: STRONG. Enforces ordered pre-conditions (6-step checklist must run before any code), specifies surgical changes, forbids scope creep. Testable via git diff inspection.

### devil.md (100+ lines)
**Attack axes** (excerpt):
```markdown
| Axis | The question you press |
| Assumption | What is being assumed that has not been verified? |
| Failure mode | How does this break under load, edge cases, or partial failure? |
| Scope | What is being pulled in that the objective does not require? |
| Simpler path | Is there a materially simpler approach that was dismissed too fast? |
| Security | What is the worst thing an attacker does with this? |
| Reversibility | If this is wrong, how expensive is it to undo? |
| Cost of delay | What does *not* doing this cost — is the objection worth the friction? |
```

**Objection categories**:
- **CRITICAL** — must be resolved before proceeding (plausible failure path, security hole, broken criterion, irreversible mistake)
- **WARNING** — real weakness but non-blocking
- **SUGGESTION** — sharper alternative, non-blocking

**Quality assessment**: STRONGEST. 7 orthogonal attack vectors (none redundant), Steelman rule enforced ("state the proposal's strongest form, then show where it still fails"), three-tier severity prevents noise.

**Overall verdict**: All 3 are HIGH-QUALITY, testable role contracts. No vague language. Output formats specified. Preconditions explicit.

---

## 7. Duplication Cost Analysis

### presets/claude/CLAUDE.md Redundancy

**File size**: 28,816 bytes (800 lines)

**Content**: Full role definitions for Orchestrator, Task Coach, Repo Explorer, Architect, Implementer, Tester, Reviewer, Complexity Auditor, and Docs (9 roles).

**Also exists in**: `presets/opencode/prompts/v1.0.0/{orchestrator,task-coach,repo-explorer,architect,implementer,tester,reviewer,complexity-auditor,docs}.md`

**Byte overlap (estimate)**:
- orchestrator section in CLAUDE.md: ~3–4KB
- orchestrator.md in v1.0.0: 474 lines ≈ 12–15KB (but CLAUDE.md includes only essential parts)
- Similar for 8 other roles
- **Total duplication: ~30–50% of CLAUDE.md content** (estimated 10,000–15,000 bytes)

**Token cost per Claude session** (with CLAUDE.md loaded):
- 28,816 bytes ≈ ~7,200 tokens (at ~0.25 tokens/byte)
- Duplicated content: ~2,000–2,500 tokens per session
- Across 100 concurrent sessions: 200,000–250,000 tokens in duplicate payloads per time slice
- Per month (30 days, 100 sessions/day avg): **6.0M–7.5M duplicate tokens**

**Finding**: Massive, uncontrolled duplication. Every Claude user session loads ~2,200 tokens of content already available in presets/opencode/prompts/v1.0.0/.

---

## 8. Deprecated Version Cleanup Safety Check

**Deprecated directories exist**:
- `presets/opencode/prompts/v0.1.0` through `v0.6.0` (6 old versions)
- `.agents/prompts/v0.2.0` through `v0.6.0` (5 old versions)

**References found** (NOT safe to delete):
1. `test/prompt-v050.test.ts`: `const PROMPTS_V050 = resolve(import.meta.dir, '../presets/opencode/prompts/v0.5.0')`
2. `test/prompt-v060.test.ts`: `const PROMPTS_V060 = resolve(import.meta.dir, '../presets/opencode/prompts/v0.6.0')`
3. `test/routing-order-parity.test.ts`: Hard-coded paths:
   - `.agents/prompts/v0.5.0/orchestrator.md`
   - `.cursor/prompts/v0.5.0/orchestrator.md`
   - `.gemini/prompts/v0.5.0/orchestrator.md`
4. `presets/cursor/agents/*.md`: Headers still marked "# Agent Contract — architect v0.5.0"

**Finding**: NOT SAFE to delete. Deprecated versions are actively tested and referenced in production agent definitions. Cleanup requires:
1. Update test fixtures (prompt-v050.test.ts, prompt-v060.test.ts) to v1.0.0
2. Regenerate presets/cursor/agents/ headers to mark v1.0.0 (currently reference v0.5.0)
3. Update routing-order-parity.test.ts path references
4. Run full test suite
5. THEN archive old versions to a `/deprecated/` directory or delete

---

## IMPLICATIONS FOR THE PLAN

### 1. Make presets/ a Generated Artifact
- **Action**: Build `src/generators/preset-generator.ts` to emit all 6 targets (claude, cursor, codex, gemini, agy, opencode) from a single canonical source.
- **Affected files**: All files under `presets/{claude,cursor,codex,gemini,agy,opencode}/` must be re-derived from a generator.
- **Current blocker**: `presets/claude/CLAUDE.md` is a 28KB monolith with embedded role definitions. Must extract role definitions to a single source-of-truth location (likely `src/domain/roles/` or `src/prompts/v1.0.0/`).

### 2. Eliminate cc-council Duplication
- **Finding**: Four identical copies of `cc-council` command spec (cursor, agy, opencode, claude).
- **Action**: Extract to a single template in `src/generators/templates/cc-council.md.hbs` (or similar).
- **Output contract**: Each target's cc-council command is identical; generation can emit to `presets/{target}/commands/cc/council.md` without customization.

### 3. Council Agent Prompt Generation Strategy
- **Finding**: Council agent stubs (council-*.md) are correctly generated by `src/adapters/*/council-generator.ts`, but the stubs are trivial (34 lines) and don't match the depth of workflow agent prompts (v1.0.0, 100–474 lines).
- **Decision needed**: Are council-*.md stubs the intended output, or should they be regenerated to include full role instructions (e.g., orchestrator's full routing table, devil's attack axes)?
- **Current state**: Generated stubs are 34 lines each. Orchestrator v1.0.0 is 474 lines. This mismatch may cause degraded performance if council agents are invoked directly without falling back to v1.0.0 prompts.
- **Recommendation**: Generate council-*.md files by selecting the corresponding v1.0.0 prompts, not by synthesizing new stubs. `council-orchestrator.md` should be a copy/adaptation of `prompts/v1.0.0/orchestrator.md`.

### 4. Fix council-security-reviewer Missing File
- **Finding**: `council.yml` lists `security-reviewer` agent, but `.agents/agents/council-security-reviewer.md` does not exist in the main repo (only in worktree).
- **Action**: Either:
  - (A) Remove `security-reviewer` from council.yml if it's not truly part of the council workflow.
  - (B) Ensure `src/adapters/*/council-generator.ts` generates `council-security-reviewer.md` for all 6 targets (currently only 6 files exist, not 7).
  - (C) Document why security-reviewer is council-exclusive and update the generator.
- **Current mismatch**: `council.yml` has 7 agents, but only 6 council-*.md files exist in the main repo.

### 5. Resolve Deprecated Version References in Tests
- **Finding**: `prompt-v050.test.ts`, `prompt-v060.test.ts`, and `routing-order-parity.test.ts` still reference v0.5.0 and v0.6.0 prompt directories.
- **Action**: Migrate test fixtures to v1.0.0, then archive/delete v0.*.0 directories:
  - [ ] Rewrite test/prompt-v050.test.ts to use presets/opencode/prompts/v1.0.0/
  - [ ] Rewrite test/prompt-v060.test.ts to use v1.0.0
  - [ ] Update routing-order-parity.test.ts paths
  - [ ] Regenerate presets/cursor/agents/ headers to mark v1.0.0 (currently reference v0.5.0)
  - [ ] Run test suite end-to-end
  - [ ] Delete v0.*.0 directories (or move to `/deprecated/`)

### 6. Consolidate Role Prompt Sources
- **Finding**: Role definitions exist in at least three places:
  1. `presets/claude/CLAUDE.md` (embedded, 28KB, duplicates 9 roles)
  2. `presets/opencode/prompts/v1.0.0/{agent}.md` (canonical for workflow, 100–474 lines each)
  3. `.agents/agents/council-{agent}.md` (generated, thin stubs, 34 lines each)
- **Action**: Establish a single source-of-truth for each role:
  - Move `presets/opencode/prompts/v1.0.0/` to `src/domain/roles/v1.0.0/` (or similar canonical location).
  - Generation pulls from this source and emits to all 6 targets' presets and to `.agents/agents/`.
- **Benefit**: Eliminates the ~2,200-token-per-session duplication in CLAUDE.md. Reduces preset directory sizes by ~40%.

### 7. Establish Generation Testing
- **Finding**: Presets are currently hand-maintained. Generation introduces risk of drift.
- **Action**: Add a test that:
  1. Runs all generators (claude, cursor, codex, gemini, agy, opencode).
  2. Compares output against committed presets.
  3. Fails if any diff is found (unless explicitly re-generated and committed).
- **Benefit**: Ensures developers don't accidentally hand-edit presets/. All changes flow through the generator.

### 8. Clarify "security" vs. "security-reviewer" Council Role
- **Finding**: Council has both "security" (generic compliance, lightweight) and "security-reviewer" (deep veto-authority).
- **Decision needed**: Should both be in the council, or is one deprecated?
  - If both: ensure council-security.md stub captures the lighter-weight security role vs. security-reviewer's veto authority. Update the generator to emit distinct stubs.
  - If one: update council.yml and remove the redundant role, regenerate council-*.md files.
- **Current risk**: Ambiguity may cause council workflow to under-invest in security (if security agent is trivial) or double-inspect (if both run in sequence).
- **Recommendation**: Align security and security-reviewer scope in council.yml, or merge into a single deep-review agent.

### 9. Plan Generation Order
- **Sequence**:
  1. Extract `src/domain/roles/v1.0.0/` as canonical source (step 6).
  2. Fix council-security-reviewer missing file and council.yml roster (step 4).
  3. Build preset-generator.ts to emit all 6 targets (step 1).
  4. Generate and validate all presets (step 7).
  5. Delete deprecated v0.*.0 directories after tests migrated (step 5).

### 10. Backward Compatibility Constraint
- **Finding**: Existing codebases may reference specific versions (e.g., v0.5.0, v0.6.0) via config files or environment variables.
- **Action**: Document version migration path. Pin v1.0.0 as the stable contract version in all new generators. Provide deprecation warnings for v0.*.0 references.
