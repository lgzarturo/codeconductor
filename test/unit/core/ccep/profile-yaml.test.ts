import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadWorkflowProfileFallback,
  loadWorkflowProfileFromYaml,
  parseWorkflowYaml,
  workflowYamlPath,
} from '../../../../src/core/ccep/profile-yaml';

const VALID_YAML = `id: feature
version: 1
command: feature
phases:
  - id: intake
    agent: task-coach
    outputSchema: planner-output
routing:
  default:
    - architect
confirmationGate:
  stopOnHighRisk: true
  stopOnQuestions: true
`;

let ROOT: string;

async function projectWithWorkflow(): Promise<string> {
  const dir = await mkdtemp(join(ROOT, 'proj-'));
  const wfDir = join(dir, '.codeconductor', 'workflows');
  await mkdir(wfDir, { recursive: true });
  await writeFile(join(wfDir, 'feature.yml'), VALID_YAML);
  return dir;
}

beforeAll(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'cc-profile-yaml-'));
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('core/ccep/profile-yaml', () => {
  describe('workflowYamlPath', () => {
    test('resolves the bundled workflow path when no project override exists', () => {
      expect(typeof workflowYamlPath('feature')).toBe('string');
    });

    test('prefers a project override under .codeconductor/workflows', async () => {
      const root = await projectWithWorkflow();
      const path = workflowYamlPath('feature', root);
      expect(path).not.toBeNull();
      expect(path?.includes('.codeconductor')).toBe(true);
      expect(path?.endsWith('feature.yml')).toBe(true);
    });
  });

  describe('parseWorkflowYaml', () => {
    test('parses and validates a well-formed profile', () => {
      const profile = parseWorkflowYaml(VALID_YAML);
      expect(profile.id).toBe('feature');
      expect(profile.command).toBe('feature');
    });

    test('throws when the yaml violates the schema', () => {
      expect(() => parseWorkflowYaml('id: feature\nversion: 1\n')).toThrow();
    });
  });

  describe('loadWorkflowProfileFromYaml', () => {
    test('loads a project override profile', async () => {
      const root = await projectWithWorkflow();
      const profile = loadWorkflowProfileFromYaml('feature', root);
      expect(profile?.id).toBe('feature');
    });
  });

  describe('loadWorkflowProfileFallback', () => {
    test('returns a bundled profile for a known command', () => {
      expect(loadWorkflowProfileFallback('feature').id).toBe('feature');
    });

    test('throws for an unknown command', () => {
      // @ts-expect-error — exercising the runtime guard with an invalid command
      expect(() => loadWorkflowProfileFallback('bogus')).toThrow('Unknown workflow command');
    });
  });
});
