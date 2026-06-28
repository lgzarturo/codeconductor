---
name: council
description: Multi-agent council for code review and architecture decisions
version: 0.2.0
---

# Council Skill

Multi-perspective analysis through structured deliberation. Each council agent reviews from a distinct axis — no overlap, no gaps.

## Behavioral Discipline

- **Think Before Reviewing**: State assumptions. Surface conflicts between perspectives. If two agents disagree, that is a finding — not a problem to hide.
- **Simplicity Gate**: Flag overcomplicated solutions. Ask: "Would a senior engineer say this is overbuilt?"
- **Surgical Scope**: Review only what changed. Do not suggest unrelated improvements.
- **Goal-Driven Verdict**: Every finding must trace to a verifiable concern. Opinions without evidence are not findings.

## Council Agents

| Agent | Axis | Reviews For |
|-------|------|-------------|
| **Architect** | Structure | Module boundaries, coupling, cohesion, pattern consistency, scalability constraints |
| **Security** | Risk | Injection vectors, auth bypasses, secret exposure, data protection, compliance gaps |
| **Product** | Value | Requirements alignment, UX impact, acceptance criteria coverage, business value |
| **Delivery** | Operations | Testability, deployment risk, CI/CD impact, rollback plan, monitoring gaps |
| **DataOps** | Data | Data integrity, migration safety, pipeline impact, schema compatibility |
| **Devil** | Failure | Edge cases, hidden assumptions, failure modes, worst-case scenarios, race conditions |

## Deliberation Protocols

### Protocol 1: Spec-Driven Development (Pre-Implementation)
When invoked for planning (SDD Phase):
1. **Requirements Analysis** — `task-coach` (Product) clarifies the prompt and defines verifiable acceptance criteria.
2. **Technical Proposal** — `architect` proposes the simplest possible technical approach.
3. **Devil's Advocate** — `devil` challenges the approach for over-engineering, hidden assumptions, or missing edge cases.
4. **Consensus** — Agree on the absolute minimum scope.
5. **Output** — A strict, verifiable Task Card & Technical Plan.

### Protocol 2: Code Review (Post-Implementation)
When invoked for code review:
1. **Individual Review** — Each agent reviews independently against their axis. Produces findings categorized as CRITICAL, WARNING, or SUGGESTION.
2. **Cross-Review** — Agents read each other's findings. Flag agreements and conflicts.
3. **Consensus Round** — Resolve conflicts through evidence. If unresolvable, escalate.
4. **Verdict** — Aggregate findings. Apply voting rules.

## Voting Rules

| Condition | Verdict |
|-----------|---------|
| Any agent finds CRITICAL | **blocked** — must resolve before merge |
| No CRITICAL, 2+ agents find WARNING | **approved with warnings** — resolve recommended |
| No CRITICAL, 0-1 WARNING | **approved** |
| Agents disagree on severity | Escalate to human with both perspectives |

## Escalation Triggers

- Two or more agents classify the same finding at different severity levels
- Security agent finds a CRITICAL that Architect considers acceptable risk
- Devil's Advocate identifies a failure mode with no mitigation in the Technical Plan
- Any finding that requires information not available in the diff or plan

## Council Verdict Format

```markdown
## Council Verdict

**Task**: [objective]
**Verdict**: [approved | approved with warnings | blocked]

### Findings by Agent

**Architect**: [findings or "no findings"]
**Security**: [findings or "no findings"]
**Product**: [findings or "no findings"]
**Delivery**: [findings or "no findings"]
**DataOps**: [findings or "no findings"]
**Devil**: [findings or "no findings"]

### Vote Summary

| Agent | Vote | Key Concern |
|-------|------|-------------|
| ... | approve/warn/block | [one sentence] |

### Conflicts

[List disagreements between agents, or "none"]

### Recommendation

[One paragraph: what to do next]
```

## When to Convene the Council

- High-risk tasks (database migrations, auth changes, public API modifications)
- Architecture decisions with long-term impact
- When the Reviewer finds 2+ CRITICAL findings
- When the Orchestrator is uncertain about risk classification
- Before major refactors that touch module boundaries
