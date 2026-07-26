import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorkflowProfile } from '../../src/core/ccep/workflow-profile-loader';
import { parseWorkflowYaml } from '../../src/core/ccep/profile-yaml';

describe('ccep workflow yaml', () => {
  test('loads bundled YAML profiles by default', () => {
    const profile = loadWorkflowProfile('feature');
    expect(profile.id).toBe('feature');
    expect(profile.phases.length).toBeGreaterThan(0);
  });

  test('project override in .codeconductor/workflows/ takes precedence', async () => {
    const dir = join(tmpdir(), `ccep-yaml-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const workflowsDir = join(dir, '.codeconductor', 'workflows');
    await mkdir(workflowsDir, { recursive: true });

    await writeFile(
      join(workflowsDir, 'fix.yml'),
      `id: fix
version: 1
command: fix
phases:
  - id: custom-intake
    agent: task-coach
    outputSchema: planner-output
routing:
  default:
    - custom-intake
confirmationGate:
  stopOnHighRisk: false
  stopOnQuestions: true
`,
    );

    const profile = loadWorkflowProfile('fix', dir);
    expect(profile.phases[0]?.id).toBe('custom-intake');
    expect(profile.confirmationGate.stopOnHighRisk).toBe(false);
  });

  test('parseWorkflowYaml validates against WorkflowProfileSchema', () => {
    const profile = parseWorkflowYaml(`id: review
version: 1
command: review
intakeSchema: review-target
phases:
  - id: diff-collection
    agent: reviewer
routing:
  default:
    - diff-collection
confirmationGate:
  stopOnHighRisk: false
  stopOnQuestions: false
`);
    expect(profile.command).toBe('review');
  });
});
