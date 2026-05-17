import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { existsSync } from 'node:fs'

import { ModelConfigSchema } from '../src/validation/schemas'
import { loadModelConfig, loadManifest } from '../src/core/presets/manifest-loader'
import { copyFromManifest } from '../src/core/presets/file-copier'

const PROJECT_ROOT = resolve(import.meta.dir, '..')
const CLI_CMD = ['bun', 'run', 'src/cli/main.ts']
const PRESETS_DIR = resolve(PROJECT_ROOT, 'presets')

async function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { spawn } = await import('bun')
  const process = spawn({
    cmd: [...CLI_CMD, ...args],
    cwd: PROJECT_ROOT,
    stdout: 'pipe',
    stderr: 'pipe'
  })
  const [stdout, stderr] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text()
  ])
  const exitCode = await process.exited
  return { exitCode, stdout, stderr }
}

async function cleanup() {
  for (const dir of ['.opencode', '.claude', '.codex', '.codeconductor']) {
    try { await rm(join(PROJECT_ROOT, dir), { recursive: true, force: true }) } catch {}
  }
}

const ALL_AGENT_FILES = [
  'architect.md', 'implementer.md', 'tester.md', 'orchestrator.md',
  'reviewer.md', 'docs.md', 'task-coach.md', 'repo-explorer.md'
]

const EXPECTED_ROLES = ['architect', 'implementer', 'tester', 'orchestrator', 'reviewer', 'docs', 'task-coach', 'repo-explorer']

// ========== 1. ModelConfigSchema Validation ==========

describe('ModelConfigSchema', () => {
  test('valid config passes validation', () => {
    const result = ModelConfigSchema.safeParse({
      target: 'opencode',
      agents: {
        architect: { claude: 'claude-opus-4-7', opencode: 'deepseek-v4-pro', codex: 'gpt-5.5' }
      }
    })
    expect(result.success).toBe(true)
  })

  test('missing target field fails validation', () => {
    const result = ModelConfigSchema.safeParse({
      agents: { architect: { claude: 'a', opencode: 'b', codex: 'c' } }
    })
    expect(result.success).toBe(false)
  })

  test('invalid target value fails validation', () => {
    const result = ModelConfigSchema.safeParse({
      target: 'invalid-target',
      agents: { architect: { claude: 'a', opencode: 'b', codex: 'c' } }
    })
    expect(result.success).toBe(false)
  })

  test('missing provider in agent model fails validation', () => {
    const result = ModelConfigSchema.safeParse({
      target: 'opencode',
      agents: { architect: { claude: 'a', opencode: 'b' } }
    })
    expect(result.success).toBe(false)
  })

  test('empty agents object is valid', () => {
    const result = ModelConfigSchema.safeParse({ target: 'claude', agents: {} })
    expect(result.success).toBe(true)
  })

  test('multiple agent roles are validated correctly', () => {
    const result = ModelConfigSchema.safeParse({
      target: 'codex',
      agents: {
        architect: { claude: 'a', opencode: 'b', codex: 'c' },
        tester: { claude: 'x', opencode: 'y', codex: 'z' }
      }
    })
    expect(result.success).toBe(true)
  })

  test('all three targets are valid enum values', () => {
    for (const target of ['opencode', 'claude', 'codex']) {
      const result = ModelConfigSchema.safeParse({
        target,
        agents: { role: { claude: 'a', opencode: 'b', codex: 'c' } }
      })
      expect(result.success).toBe(true)
    }
  })

  test('non-string model names fail validation', () => {
    const result = ModelConfigSchema.safeParse({
      target: 'opencode',
      agents: { architect: { claude: 123, opencode: true, codex: null } }
    })
    expect(result.success).toBe(false)
  })
})

// ========== 2. loadModelConfig() ==========

describe('loadModelConfig', () => {
  test('loads opencode model config with correct target', async () => {
    const config = await loadModelConfig('opencode')
    expect(config.target).toBe('opencode')
  })

  test('loads claude model config with correct target', async () => {
    const config = await loadModelConfig('claude')
    expect(config.target).toBe('claude')
  })

  test('loads codex model config with correct target', async () => {
    const config = await loadModelConfig('codex')
    expect(config.target).toBe('codex')
  })

  test('opencode config has architect models for all providers', async () => {
    const config = await loadModelConfig('opencode')
    expect(config.agents.architect.claude).toBe('claude-opus-4-7')
    expect(config.agents.architect.opencode).toBe('deepseek-v4-pro')
    expect(config.agents.architect.codex).toBe('gpt-5.5')
  })

  test('claude config has implementer models for all providers', async () => {
    const config = await loadModelConfig('claude')
    expect(config.agents.implementer.claude).toBe('claude-sonnet-4-6')
    expect(config.agents.implementer.opencode).toBe('mimo-v2.5-pro')
    expect(config.agents.implementer.codex).toBe('gpt-5.3-codex')
  })

  test('codex config has tester models for all providers', async () => {
    const config = await loadModelConfig('codex')
    expect(config.agents.tester.claude).toBe('claude-sonnet-4-6')
    expect(config.agents.tester.opencode).toBe('minimax-m2.7')
    expect(config.agents.tester.codex).toBe('gpt-5.3-codex')
  })

  test('all 8 agent roles are present in each config file', async () => {
    for (const target of ['opencode', 'claude', 'codex'] as const) {
      const config = await loadModelConfig(target)
      for (const role of EXPECTED_ROLES) {
        expect(config.agents[role]).toBeDefined()
        expect(typeof config.agents[role].claude).toBe('string')
        expect(typeof config.agents[role].opencode).toBe('string')
        expect(typeof config.agents[role].codex).toBe('string')
      }
    }
  })

  test('each config has exactly 8 agent roles', async () => {
    for (const target of ['opencode', 'claude', 'codex'] as const) {
      const config = await loadModelConfig(target)
      const roleKeys = Object.keys(config.agents)
      expect(roleKeys.length).toBe(8)
    }
  })
})

// ========== 3. copyFromManifest with modelConfig (unit-level) ==========

describe('copyFromManifest with modelConfig', () => {
  test('dry-run with model config does not write files', async () => {
    const modelConfig = await loadModelConfig('opencode')
    const manifest = await loadManifest('opencode')
    const results = await copyFromManifest(manifest, PRESETS_DIR, join(PROJECT_ROOT, '.opencode'), false, true, true, modelConfig)

    expect(results.length).toBeGreaterThan(0)
    expect(results.every(r => r.dryRun === true)).toBe(true)
    expect(existsSync(join(PROJECT_ROOT, '.opencode', 'agents', 'architect.md'))).toBe(false)
  })

  test('template entries are detected from opencode manifest', async () => {
    const manifest = await loadManifest('opencode')
    const templateEntries = manifest.entries.filter(e => e.template === true)
    expect(templateEntries.length).toBe(1)
    expect(templateEntries[0].src).toContain('agents')
  })

  test('non-template entries exist in manifest', async () => {
    const manifest = await loadManifest('opencode')
    const nonTemplateEntries = manifest.entries.filter(e => !e.template)
    expect(nonTemplateEntries.length).toBeGreaterThan(0)
    for (const entry of nonTemplateEntries) {
      expect(entry.template).toBeFalsy()
    }
  })

  test('writing with modelConfig replaces placeholders in agent files', async () => {
    const modelConfig = await loadModelConfig('opencode')
    const manifest = await loadManifest('opencode')
    const results = await copyFromManifest(manifest, PRESETS_DIR, PROJECT_ROOT, false, false, true, modelConfig)

    const architectContent = await readFile(join(PROJECT_ROOT, '.opencode', 'agents', 'architect.md'), 'utf-8')
    expect(architectContent).toContain('claude-opus-4-7')
    expect(architectContent).toContain('deepseek-v4-pro')
    expect(architectContent).toContain('gpt-5.5')
    expect(architectContent).not.toContain('{{MODEL_CLAUDE}}')
    expect(architectContent).not.toContain('{{MODEL_OPENCODE}}')
    expect(architectContent).not.toContain('{{MODEL_CODEX}}')
  })

  test('writing without modelConfig leaves placeholders intact', async () => {
    const manifest = await loadManifest('opencode')
    const results = await copyFromManifest(manifest, PRESETS_DIR, PROJECT_ROOT, false, false, true, null)

    const architectContent = await readFile(join(PROJECT_ROOT, '.opencode', 'agents', 'architect.md'), 'utf-8')
    expect(architectContent).toContain('{{MODEL_CLAUDE}}')
    expect(architectContent).toContain('{{MODEL_OPENCODE}}')
    expect(architectContent).toContain('{{MODEL_CODEX}}')
  })

  test('writing with modelConfig renders all 8 agent files correctly', async () => {
    const modelConfig = await loadModelConfig('opencode')
    const manifest = await loadManifest('opencode')
    await copyFromManifest(manifest, PRESETS_DIR, PROJECT_ROOT, false, false, true, modelConfig)

    for (const file of ALL_AGENT_FILES) {
      const content = await readFile(join(PROJECT_ROOT, '.opencode', 'agents', file), 'utf-8')
      expect(content).not.toContain('{{MODEL_')
      expect(content).toMatch(/\bclaude-[\w-]+\b/)
    }
  })
})

// ========== 4. Agent File Template Placeholders (source files) ==========

describe('Agent file templates (source presets)', () => {
  test('all opencode agent files contain MODEL_CLAUDE placeholder', async () => {
    for (const file of ALL_AGENT_FILES) {
      const content = await readFile(join(PRESETS_DIR, 'opencode', 'agents', file), 'utf-8')
      expect(content).toContain('{{MODEL_CLAUDE}}')
    }
  })

  test('all opencode agent files contain MODEL_OPENCODE placeholder', async () => {
    for (const file of ALL_AGENT_FILES) {
      const content = await readFile(join(PRESETS_DIR, 'opencode', 'agents', file), 'utf-8')
      expect(content).toContain('{{MODEL_OPENCODE}}')
    }
  })

  test('all opencode agent files contain MODEL_CODEX placeholder', async () => {
    for (const file of ALL_AGENT_FILES) {
      const content = await readFile(join(PRESETS_DIR, 'opencode', 'agents', file), 'utf-8')
      expect(content).toContain('{{MODEL_CODEX}}')
    }
  })

  test('each opencode agent file has exactly 3 placeholder occurrences (one per provider)', async () => {
    for (const file of ALL_AGENT_FILES) {
      const content = await readFile(join(PRESETS_DIR, 'opencode', 'agents', file), 'utf-8')
      const claudeMatches = (content.match(/\{\{MODEL_CLAUDE\}\}/g) || []).length
      const opencodeMatches = (content.match(/\{\{MODEL_OPENCODE\}\}/g) || []).length
      const codexMatches = (content.match(/\{\{MODEL_CODEX\}\}/g) || []).length
      expect(claudeMatches).toBe(1)
      expect(opencodeMatches).toBe(1)
      expect(codexMatches).toBe(1)
    }
  })

  test('codex AGENTS.md contains exactly 8 occurrences of each placeholder', async () => {
    const content = await readFile(join(PRESETS_DIR, 'codex', 'AGENTS.md'), 'utf-8')
    const claudeCount = (content.match(/\{\{MODEL_CLAUDE\}\}/g) || []).length
    const opencodeCount = (content.match(/\{\{MODEL_OPENCODE\}\}/g) || []).length
    const codexCount = (content.match(/\{\{MODEL_CODEX\}\}/g) || []).length
    expect(claudeCount).toBe(8)
    expect(opencodeCount).toBe(8)
    expect(codexCount).toBe(8)
  })

  test('opencode agent files still have valid frontmatter', async () => {
    for (const file of ALL_AGENT_FILES) {
      const content = await readFile(join(PRESETS_DIR, 'opencode', 'agents', file), 'utf-8')
      expect(content.startsWith('---')).toBe(true)
      const secondDash = content.indexOf('---', 3)
      expect(secondDash).toBeGreaterThan(0)
    }
  })
})

// ========== 5. Manifest Template Flag ==========

describe('Manifest template flag', () => {
  test('opencode manifest marks agents entry as template', async () => {
    const manifest = await loadManifest('opencode')
    const agentsEntry = manifest.entries.find(e => e.src.includes('agents'))
    expect(agentsEntry).toBeDefined()
    expect(agentsEntry!.template).toBe(true)
  })

  test('claude manifest marks agents entry as template', async () => {
    const manifest = await loadManifest('claude')
    const agentsEntry = manifest.entries.find(e => e.src.includes('agents'))
    expect(agentsEntry).toBeDefined()
    expect(agentsEntry!.template).toBe(true)
  })

  test('codex manifest marks AGENTS.md entry as template', async () => {
    const manifest = await loadManifest('codex')
    const agentsEntry = manifest.entries.find(e => e.src.includes('AGENTS.md'))
    expect(agentsEntry).toBeDefined()
    expect(agentsEntry!.template).toBe(true)
  })

  test('non-agent entries do not have template flag set', async () => {
    const manifest = await loadManifest('opencode')
    const nonAgentEntries = manifest.entries.filter(e => !e.src.includes('agents'))
    for (const entry of nonAgentEntries) {
      expect(entry.template).toBeUndefined()
    }
  })

  test('claude manifest has exactly 6 entries', async () => {
    const manifest = await loadManifest('claude')
    expect(manifest.entries.length).toBe(6)
  })

  test('codex manifest has exactly 3 entries', async () => {
    const manifest = await loadManifest('codex')
    expect(manifest.entries.length).toBe(3)
  })
})

// ========== 6. End-to-End CLI Tests ==========

describe('End-to-end: CLI install preset renders model names', () => {
  beforeAll(async () => { await cleanup() })
  beforeEach(async () => { await cleanup() })

  test('opencode: install preset creates agent files (files exist)', async () => {
    await runCli(['init', '--force'])
    const result = await runCli(['install', 'preset', '--target=opencode', '--force'])
    expect(result.exitCode).toBe(0)

    for (const file of ALL_AGENT_FILES) {
      expect(existsSync(join(PROJECT_ROOT, '.opencode', 'agents', file))).toBe(true)
    }
  })

  test('claude: install preset creates agent files (files exist)', async () => {
    await runCli(['init', '--force'])
    const result = await runCli(['install', 'preset', '--target=claude', '--force'])
    expect(result.exitCode).toBe(0)

    for (const file of ALL_AGENT_FILES) {
      expect(existsSync(join(PROJECT_ROOT, '.claude', 'agents', file))).toBe(true)
    }
  })

  test('codex: install preset creates AGENTS.md', async () => {
    await runCli(['init', '--force'])
    const result = await runCli(['install', 'preset', '--target=codex', '--force'])
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(PROJECT_ROOT, '.codex', 'AGENTS.md'))).toBe(true)
  })

  // --- TEMPLATE RENDERING (Acceptance Criteria) ---
  // These test that the CLI renders model names in generated files.

  test('opencode: architect.md should have rendered model names (no placeholders)', async () => {
    await runCli(['init', '--force'])
    await runCli(['install', 'preset', '--target=opencode', '--force'])

    const content = await readFile(join(PROJECT_ROOT, '.opencode', 'agents', 'architect.md'), 'utf-8')
    // Should contain actual model names
    expect(content).toContain('claude-opus-4-7')
    expect(content).toContain('deepseek-v4-pro')
    expect(content).toContain('gpt-5.5')
    // Should NOT contain placeholders
    expect(content).not.toContain('{{MODEL_CLAUDE}}')
    expect(content).not.toContain('{{MODEL_OPENCODE}}')
    expect(content).not.toContain('{{MODEL_CODEX}}')
  })

  test('opencode: all 8 agent files should have no placeholders', async () => {
    await runCli(['init', '--force'])
    await runCli(['install', 'preset', '--target=opencode', '--force'])

    for (const file of ALL_AGENT_FILES) {
      const content = await readFile(join(PROJECT_ROOT, '.opencode', 'agents', file), 'utf-8')
      expect(content).not.toContain('{{MODEL_')
    }
  })

  test('opencode: tester.md should have correct model names', async () => {
    await runCli(['init', '--force'])
    await runCli(['install', 'preset', '--target=opencode', '--force'])

    const content = await readFile(join(PROJECT_ROOT, '.opencode', 'agents', 'tester.md'), 'utf-8')
    expect(content).toContain('claude-sonnet-4-6')
    expect(content).toContain('minimax-m2.7')
    expect(content).toContain('gpt-5.3-codex')
  })

  test('codex: AGENTS.md should have rendered model names', async () => {
    await runCli(['init', '--force'])
    await runCli(['install', 'preset', '--target=codex', '--force'])

    const content = await readFile(join(PROJECT_ROOT, '.codex', 'AGENTS.md'), 'utf-8')
    expect(content).toContain('claude-opus-4-7')
    expect(content).toContain('deepseek-v4-pro')
    expect(content).toContain('gpt-5.5')
    expect(content).not.toContain('{{MODEL_CLAUDE}}')
    expect(content).not.toContain('{{MODEL_OPENCODE}}')
    expect(content).not.toContain('{{MODEL_CODEX}}')
  })

  test('claude: architect.md should have rendered model names', async () => {
    await runCli(['init', '--force'])
    await runCli(['install', 'preset', '--target=claude', '--force'])

    const content = await readFile(join(PROJECT_ROOT, '.claude', 'agents', 'architect.md'), 'utf-8')
    expect(content).toContain('claude-opus-4-7')
    expect(content).toContain('deepseek-v4-pro')
    expect(content).toContain('gpt-5.5')
    expect(content).not.toContain('{{MODEL_CLAUDE}}')
  })

  test('target=all should render for all three presets', async () => {
    await runCli(['init', '--force'])
    await runCli(['install', 'preset', '--target=all', '--force'])

    const opencodeContent = await readFile(join(PROJECT_ROOT, '.opencode', 'agents', 'architect.md'), 'utf-8')
    expect(opencodeContent).not.toContain('{{MODEL_')

    const claudeContent = await readFile(join(PROJECT_ROOT, '.claude', 'agents', 'architect.md'), 'utf-8')
    expect(claudeContent).not.toContain('{{MODEL_')

    const codexContent = await readFile(join(PROJECT_ROOT, '.codex', 'AGENTS.md'), 'utf-8')
    expect(codexContent).not.toContain('{{MODEL_')
  })

  test('orchestrator agent should have correct models for opencode', async () => {
    await runCli(['init', '--force'])
    await runCli(['install', 'preset', '--target=opencode', '--force'])

    const content = await readFile(join(PROJECT_ROOT, '.opencode', 'agents', 'orchestrator.md'), 'utf-8')
    expect(content).toContain('claude-sonnet-4-6')
    expect(content).toContain('deepseek-v4-pro')
    expect(content).toContain('gpt-5.2')
  })

  test('docs agent should have correct models for opencode', async () => {
    await runCli(['init', '--force'])
    await runCli(['install', 'preset', '--target=opencode', '--force'])

    const content = await readFile(join(PROJECT_ROOT, '.opencode', 'agents', 'docs.md'), 'utf-8')
    expect(content).toContain('claude-haiku-4-5-20251001')
    expect(content).toContain('qwen-3.6-plus')
    expect(content).toContain('gpt-5.4-mini')
  })
})
