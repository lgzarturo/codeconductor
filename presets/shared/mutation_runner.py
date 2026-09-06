#!/usr/bin/env python3
"""Deterministic mutation-testing runner (stdlib only).

Applies single syntactic mutations over comparison operators in a Python
production file and re-runs the test suite per mutant. If a mutant survives
(tests still pass), the runner writes a handoff for the `tdd_craftsman` agent
(`specs/handover.md`, appended to `specs/implementation-summary.md`, optional
Engram/MCP memory hook) and exits with code 2 (HANDS_OFF). If every mutant is
killed, it exits 0 (PASS). The original source is always restored.

Usage:
    python3 mutation_runner.py --target src/billing.py \
        --test-command "pytest tests/test_billing.py" [--spec-folder specs]
"""
import argparse
import ast
import difflib
import json
import os
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


@dataclass(frozen=True)
class MutationRecord:
    mutant_id: str
    target_file: str
    line_number: int
    original_op: str
    mutated_op: str
    diff: str
    survived: bool
    details: str


class DeterministicOperatorMutator(ast.NodeTransformer):
    """Applies one deterministic syntactic mutation over a comparison operator."""

    OP_MAP = {
        ast.Gt: ast.LtE,      # >  -> <=
        ast.Lt: ast.GtE,      # <  -> >=
        ast.GtE: ast.Lt,      # >= -> <
        ast.LtE: ast.Gt,      # <= -> >
        ast.Eq: ast.NotEq,    # == -> !=
        ast.NotEq: ast.Eq,    # != -> ==
        ast.Is: ast.IsNot,    # is -> is not
        ast.IsNot: ast.Is,    # is not -> is
    }

    def __init__(self, target_index: int):
        super().__init__()
        self.target_index = target_index
        self.current_index = 0
        self.applied_mutation: Optional[Tuple[int, str, str]] = None

    def visit_Compare(self, node: ast.Compare) -> ast.AST:
        mutated_ops = []
        modified = False

        for op in node.ops:
            op_type = type(op)
            if op_type in self.OP_MAP:
                if self.current_index == self.target_index:
                    new_op = self.OP_MAP[op_type]()
                    mutated_ops.append(new_op)
                    modified = True
                    self.applied_mutation = (
                        node.lineno,
                        op_type.__name__,
                        type(new_op).__name__,
                    )
                else:
                    mutated_ops.append(op)
                self.current_index += 1
            else:
                mutated_ops.append(op)

        if modified:
            node.ops = mutated_ops
            return node
        return self.generic_visit(node)


class MutationEngine:
    def __init__(self, target_file: str, test_command: str, spec_folder: str = "specs"):
        self.target_file = Path(target_file).resolve()
        self.test_command = test_command
        self.spec_folder = Path(spec_folder)
        self.original_source = self.target_file.read_text(encoding="utf-8")
        self.spec_folder.mkdir(parents=True, exist_ok=True)

    def _count_mutation_points(self) -> int:
        tree = ast.parse(self.original_source)
        count = 0
        for node in ast.walk(tree):
            if isinstance(node, ast.Compare):
                for op in node.ops:
                    if type(op) in DeterministicOperatorMutator.OP_MAP:
                        count += 1
        return count

    def _clear_bytecode_cache(self) -> None:
        """Removes cached bytecode for the target so mutants are not shadowed
        by a stale .pyc with an equal-mtimestamp source."""
        cache_dir = self.target_file.parent / "__pycache__"
        if cache_dir.is_dir():
            for pyc in cache_dir.glob(f"{self.target_file.stem}.*.pyc"):
                pyc.unlink(missing_ok=True)

    def _run_test_suite(self) -> bool:
        """Runs the test suite. Returns True if every test passes."""
        self._clear_bytecode_cache()
        env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
        result = subprocess.run(
            self.test_command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )
        return result.returncode == 0

    def _create_diff(self, mutated_source: str) -> str:
        return "\n".join(
            difflib.unified_diff(
                self.original_source.splitlines(),
                mutated_source.splitlines(),
                fromfile=f"a/{self.target_file.name}",
                tofile=f"b/{self.target_file.name}",
                lineterm="",
            )
        )

    def _persist_to_engram_or_markdown(self, record: MutationRecord) -> None:
        """Documents the handoff in handover.md and implementation-summary.md."""
        markdown_summary = self.spec_folder / "implementation-summary.md"
        handover_file = self.spec_folder / "handover.md"

        payload_md = f"""## Mutation Gate: Survivor Detected (TDD Gap)
- **Target File**: `{record.target_file}`
- **Line**: {record.line_number}
- **Mutant ID**: `{record.mutant_id}`
- **Operator Change**: `{record.original_op}` -> `{record.mutated_op}`
- **Status**: SURVIVED (Scorecard Real Coverage: 0)

### Reproduction Diff
```diff
{record.diff}
```

### Action Required by `tdd_craftsman`

1. Do NOT touch production implementation.
2. Write a minimal failing test (TDD Law 1 & 2) that asserts this branch condition.
3. Verify the test turns red before re-verifying production code.
"""
        # Handover update for continuity
        handover_file.write_text(payload_md, encoding="utf-8")

        with markdown_summary.open("a", encoding="utf-8") as f:
            f.write(f"\n\n{payload_md}")

        # Optional Engram / MCP memory integration
        self._notify_engram(record)

    def _notify_engram(self, record: MutationRecord) -> None:
        """Invokes the local Engram/Memory Engine hook or CLI if present."""
        if shutil.which("engram"):
            try:
                subprocess.run(
                    [
                        "engram",
                        "memory:save",
                        "--tag",
                        "mutation_testing",
                        "--title",
                        f"Survivor {record.mutant_id}",
                        "--body",
                        json.dumps(asdict(record)),
                    ],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except Exception:
                pass

    def run(self) -> Dict[str, object]:
        # 1. Pre-flight check: tests must pass on the clean base code
        if not self._run_test_suite():
            raise RuntimeError("The test suite is already failing on unmutated base code.")

        total_points = self._count_mutation_points()
        survivors: List[MutationRecord] = []

        try:
            for idx in range(total_points):
                mutator = DeterministicOperatorMutator(target_index=idx)
                tree = ast.parse(self.original_source)
                mutated_tree = mutator.visit(tree)
                ast.fix_missing_locations(mutated_tree)

                mutated_source = ast.unparse(mutated_tree)
                diff = self._create_diff(mutated_source)

                # Apply mutant to disk
                self.target_file.write_text(mutated_source, encoding="utf-8")

                # Run tests against the mutant
                passed = self._run_test_suite()

                if passed:
                    # The mutant survived: tests are blind to this change
                    lineno, orig, mut = mutator.applied_mutation or (0, "Unknown", "Unknown")
                    survivor = MutationRecord(
                        mutant_id=f"MUT_{idx:03d}_L{lineno}",
                        target_file=str(self.target_file),
                        line_number=lineno,
                        original_op=orig,
                        mutated_op=mut,
                        diff=diff,
                        survived=True,
                        details="Tests passed with inverted comparison logic. Missing explicit assert.",
                    )
                    survivors.append(survivor)

                    # Safe Fail-Fast protocol: immediate handoff to the craftsman
                    self._persist_to_engram_or_markdown(survivor)
                    return {
                        "status": "HANDS_OFF_TRIGGERED",
                        "target_agent": "tdd_craftsman",
                        "surviving_mutant": asdict(survivor),
                    }

        finally:
            # Unconditional deterministic rollback: restore original source
            self.target_file.write_text(self.original_source, encoding="utf-8")

        return {
            "status": "PASS",
            "total_mutants_killed": total_points,
            "survivors_count": 0,
        }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Deterministic stdlib mutation runner.")
    parser.add_argument("--target", required=True, help="Python production file to mutate.")
    parser.add_argument("--test-command", required=True, help="Shell command that runs the test suite.")
    parser.add_argument("--spec-folder", default="specs", help="Folder for handoff artifacts.")
    args = parser.parse_args(argv)

    engine = MutationEngine(
        target_file=args.target,
        test_command=args.test_command,
        spec_folder=args.spec_folder,
    )
    outcome = engine.run()
    print(json.dumps(outcome, indent=2))

    if outcome["status"] == "HANDS_OFF_TRIGGERED":
        # Exit code 2 tells the orchestrator (craftsman_lead) to reroute to tdd_craftsman
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
