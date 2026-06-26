---
name: multi-agent-orchestration
description: Design and coordinate multi-agent systems where specialized agents collaborate to solve complex problems. Covers agent communication, task delegation, workflow orchestration, and result aggregation.
---

# Multi-Agent Orchestration

Orchestrate multi-agent systems where specialized agents collaborate on complex tasks.

## Behavioral Discipline

1. **Think Before Delegating** — Define clear task boundaries before spawning agents. A vague delegation produces vague results.
2. **Simplicity First** — Start with 2-3 agents. Add complexity only when the simple approach demonstrably fails.
3. **Surgical Delegation** — Each agent touches only its assigned scope. Overlapping responsibilities create conflicts.
4. **Goal-Driven Orchestration** — Every agent must produce a verifiable deliverable. "Done" without evidence is not done.

## Core Concepts

### Agent Definition

An agent is defined by:
- **Role**: What responsibility does it have?
- **Goal**: What deliverable must it produce?
- **Tools**: What capabilities can it access?
- **Scope**: What boundaries must it respect?
- **Verification**: How do we know it succeeded?

### Orchestration Patterns

| Pattern | Flow | Use When |
|---------|------|----------|
| **Sequential** | A → B → C | Steps have dependencies, each builds on previous |
| **Parallel** | A \| B \| C → Aggregate | Independent analyses, need speed or diversity |
| **Hierarchical** | Manager → Workers | Large projects with oversight needs |
| **Consensus** | All agents → Debate → Vote | Complex decisions needing multiple perspectives |
| **Tool-Mediated** | Agents share tools/data | Large systems, indirect coordination |

### CodeConductor Agent Mapping

| CC Agent | Orchestration Role | Pattern |
|----------|-------------------|--------|
| Orchestrator | Manager/Coordinator | Hierarchical |
| Task Coach | Intake/Validator | Sequential (first) |
| Repo Explorer | Scout/Mapper | Sequential (first) |
| Architect | Designer/Planner | Sequential → Parallel |
| Implementer | Worker/Builder | Sequential |
| Tester | Validator/Verifier | Sequential or Parallel |
| Reviewer | Quality Gate | Sequential (last) |
| Docs | Chronicler | Sequential (last) |
| Council | Consensus Panel | Consensus |

## Communication Patterns

| Pattern | Mechanism | When to Use |
|---------|-----------|-------------|
| **Direct** | Agent A sends message to Agent B | Clear handoff, sequential flow |
| **Shared Memory** | Agents read/write shared state | Multiple agents need same data |
| **Broadcast** | Manager sends to all agents | Status updates, priority changes |
| **Event-Driven** | Agents react to state changes | Loose coupling, adaptive workflows |

## Best Practices

### Agent Design
- Clear, specific role — no overlap with other agents
- Appropriate tools for the role — not everything available
- Defined deliverable format — structured output, not free text
- Explicit scope boundaries — what it must NOT touch

### Workflow Design
- Clear task dependencies — know what blocks what
- Defined handoff points — explicit input/output contracts
- Error handling between agents — what happens when one fails
- Human intervention points — when to stop and ask
- Maximum iteration limits — prevent infinite loops

### Orchestration
- Document the routing decision before execution
- Set success criteria per agent, not just per workflow
- Monitor cost (tokens/API calls) across the team
- Implement feedback loops with iteration caps (max 3)

## Common Challenges

| Challenge | Root Cause | Solution |
|-----------|-----------|----------|
| Agent conflicts | Overlapping responsibilities | Strict role separation, clear scope |
| Slow execution | Sequential bottlenecks | Parallelize independent tasks |
| Poor quality | Weak prompts or missing context | Better agent contracts, skill references |
| Scope creep | Agents "helping" beyond scope | Enforce surgical delegation |
| Infinite loops | No exit conditions | Cap iterations at 3, escalate |
| Context loss | Too many handoffs | Use shared state, minimize chain length |

## Implementation Checklist

- [ ] Define each agent's role, goal, and scope
- [ ] Identify tools/capabilities per agent
- [ ] Plan workflow pattern (sequential, parallel, hierarchical)
- [ ] Define communication and handoff contracts
- [ ] Set success criteria per agent
- [ ] Add error handling and iteration caps
- [ ] Implement monitoring/logging
- [ ] Test agents individually, then together
- [ ] Optimize based on cost and quality metrics

## Getting Started

1. **Start Small** — 2-3 agents with clear roles
2. **Define Contracts** — What each agent receives and produces
3. **Test Solo** — Validate each agent independently
4. **Integrate** — Connect agents, test handoffs
5. **Monitor** — Track performance, cost, and quality
6. **Scale** — Add agents only when justified by complexity

## References

For framework-specific implementations, see:
- [`examples/orchestration_patterns.py`](examples/orchestration_patterns.py)
- [`examples/framework_implementations.py`](examples/framework_implementations.py)
- [`scripts/agent_communication.py`](scripts/agent_communication.py)
- [`scripts/workflow_management.py`](scripts/workflow_management.py)
