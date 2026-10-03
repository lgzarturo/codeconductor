---
name: council
description: "Multi-agent council for code review and architecture decisions"
---

# Council Skill

## Version
0.1.0

## Agents
- Architect (architect): architecture, design-patterns, code-structure
- Product (product): requirements, ux, business-value
- Delivery (delivery): delivery, testing, deployment
- DataOps (data-ops): data, pipelines, analytics
- Security Reviewer (security-reviewer): security, vulnerabilities, compliance, credentials, injection, auth, supply-chain
- Devil (devil): review, edge-cases, failure-modes

## Usage
Use the council agents to get multi-perspective analysis on code changes, architecture decisions, and security reviews.

## Instructions
Coordinate with the council agents and synthesize their perspectives into the configured output contract.

## Review rounds
At most 3 review rounds per change -- after the third round, deliver the verdict with the unresolved findings instead of looping. One compiled prompt per voter; select the panel with `ccep consensus --panel --type <type> --scope <a,b> [--risk low|medium|high]`.

## Context
v1
