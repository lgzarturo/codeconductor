# ADR-013: Receipt-Driven Development

## Status

Accepted

## Context

TDD and Mutation Testing establish behavior at a point in time. CodeConductor
needed a native way to determine whether the code, tests, contracts, lockfiles,
and configuration currently presented are the same candidate that produced the
recorded evidence.

## Decision

CodeConductor records SHA-256 manifests as local RDD receipts. Verification
consumers recompute their manifests before accepting evidence. TDD transitions
and OpenSpec completion require current receipts; ODD resumption reports stale
receipts as a conflict; Council candidate hashes are checked against the current
candidate when configured.

RDD is local integrity evidence. It does not sign receipts, manage keys, or
provide an external attestation service. Mutation Testing remains an independent
quality gate.

## Consequences

Changes after verification require the affected check to run again. Historical
evidence stays recorded but cannot satisfy a current gate once its receipt is
stale. Runtime state and generated outputs are excluded so writing a receipt
does not invalidate itself.
