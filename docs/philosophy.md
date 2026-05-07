# Philosophy

## The Problem

Most AI coding workflows fail for the same reason.

They treat the model as a developer.

They hand it a vague task, hope for a correct result, and when it goes wrong —
and it will go wrong — there is no structure to diagnose why. No routing
decision to revisit. No contract to compare against. No audit trail. Just a
conversation history and a broken diff.

This is not an AI problem. It is an engineering process problem.

---

## The Thesis

A language model is not a developer. It is a **specialized worker** that
operates best inside a controlled system with explicit inputs, defined scope,
and measurable outputs.

CodeConductor provides that system.

It does not make the model smarter. It makes the workflow reproducible.

```text
Most teams prompt.
CodeConductor orchestrates.
```

The difference:

| Prompting                      | Orchestrating                                        |
| ------------------------------ | ---------------------------------------------------- |
| Ad-hoc request to a model      | Structured Task Card with context and constraints    |
| Hope the model figures it out  | Route to the agent specialized for that task type    |
| No risk classification         | Explicit risk level drives who touches the code      |
| No audit trail                 | Every deliverable has a scorecard and session log    |
| Different results each time    | Reproducible workflow regardless of who runs it      |
| Prompts live in someone's head | Agent Contracts are versioned alongside the codebase |

---

## Why Prompt Collections Fail

There are thousands of repositories called "awesome prompts for Claude" or "my
AI dev setup".

Most are graveyards. Someone stars them, copies three prompts, and never comes
back.

They fail because they solve the wrong problem. The problem is not prompt
quality. The problem is **workflow discipline**.

A well-written prompt inside a broken workflow produces a well-written failure.

CodeConductor does not collect prompts. It defines:

- who is responsible for each phase of a task
- what inputs each agent requires before starting
- what outputs each agent must produce to be done
- when to escalate, when to stop, when to ask
- how to measure whether the result is acceptable

Without those constraints, the model has no boundary. It will happily implement
the wrong feature, refactor what should not be touched, and push to a branch it
should never see — politely, confidently, and completely wrong.

---

## The Human Leads

AI is a tool. The human architects, decides, and validates.

This is not a philosophical position about AI risk. It is an engineering
position about accountability.

If the model makes an architectural decision you did not authorize, you own the
consequences. CodeConductor makes that boundary explicit: the `architect` agent
produces a design, a human approves it, the `implementer` agent executes it. No
agent skips a step.

The framework enforces the discipline that stops the model from acting as a
decision-maker it is not equipped to be.

You need to know:

- what to ask
- why the answer might be wrong
- how to verify the deliverable

CodeConductor gives you the structure. You bring the judgment.

---

## Against Immediacy

The impulse to automate everything from day one is a trap.

> "Let me add multi-provider support, a dashboard, automated evaluation, and a
> marketplace."

That is designing an abstraction for requirements you have not yet measured. The
result is a framework built around hypothetical use cases that serves no real
workflow well.

CodeConductor starts with one target (OpenCode, Claude), one stack (Spring
Boot+Kotlin), and one complete end-to-end workflow. That workflow must be proven
to work in a real project before anything else is added.

First: a preset that works. Then: a CLI that installs it. Then: a second stack.
Then: a second provider.

Each step builds on demonstrated value, not speculation.

---

## Reproducibility as a First-Class Goal

The most important property of an engineering workflow is not speed. It is
reproducibility.

A workflow that produces different results depending on who runs it, what mood
the conversation is in, or which version of a system prompt is currently on
someone's machine — is not a workflow. It is a ritual.

CodeConductor makes workflows reproducible by:

- **Versioning Agent Contracts** alongside the codebase (not in someone's chat
  history)
- **Defining Routing Policies** that are explicit and auditable, not implicit
  and forgotten
- **Using Task Cards** that capture context, constraints, and acceptance
  criteria — not free-form requests
- **Requiring Scorecards** that measure deliverable quality before merge, not
  after

A team using CodeConductor today should produce the same quality of workflow as
that same team in six months, with different people, on a different machine.

---

## What CodeConductor Is Not

It is not:

- a prompt collection
- a chatbot wrapper
- a way to generate code faster without understanding it
- a replacement for engineering judgment
- a tool that works without human review at the boundary

It is:

- a structured orchestration layer for AI-assisted engineering
- a set of versioned, auditable contracts between humans and specialized agents
- a routing framework that classifies risk before any code is written
- an installer of reproducible workflows, not one-off configurations

---

## The Standard

If you cannot explain what the `architect` agent produced before the
`implementer` agent touched a single file, the workflow failed — regardless of
whether the code compiled.

That is the standard CodeConductor holds itself and its users to.

Stop prompting. Start orchestrating.
