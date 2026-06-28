import { describe, expect, test, afterEach, beforeEach, mock } from 'bun:test';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { doctorCommand } from '../src/commands/doctor.command';
import { renderTemplate } from '../src/core/presets/file-copier';
import { detectComplementaryTools } from '../src/core/presets/update-checker';

const TEST_DIR = resolve(import.meta.dir, '..', 'test-complementary-tmp');

describe('Complementary Tools Support', () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('detectComplementaryTools checks PATH and environment', () => {
    const status = detectComplementaryTools();
    // Should return an object with all tools mapped as boolean
    expect(status).toHaveProperty('rtk');
    expect(status).toHaveProperty('codeReviewGraph');
    expect(status).toHaveProperty('tokenSavior');
    expect(status).toHaveProperty('caveman');
    expect(status).toHaveProperty('engram');
    expect(status).toHaveProperty('gentleAi');
  });

  test('doctorCommand reports complementary tools status', async () => {
    // Setup a dummy config.yml
    const codeconductorDir = join(TEST_DIR, '.codeconductor');
    await mkdir(codeconductorDir, { recursive: true });
    const config = `
version: 0.3.0
project:
  name: test-project
  profile: node
defaults:
  target: claude
  overwrite: true
  locale: en
presets:
  council:
    enabled: true
    version: 0.3.0
safety:
  destructiveCommands: []
  secretPatterns: []
`;
    await writeFile(join(codeconductorDir, 'config.yml'), config);

    const result = await doctorCommand({
      output: 'json',
      projectRoot: TEST_DIR,
    });

    console.log("DOCTOR RESULT:", JSON.stringify(result, null, 2));

    expect(result.code).toBeDefined();
    const data = result.data as any;
    expect(data.checks).toBeDefined();
    
    // Check if checks contains warning or passing checks for all 7 complementary tools
    const checks = data.checks;
    const toolsToCheck = ['rtk', 'code-review-graph', 'token-savior', 'caveman', 'engram', 'gentle-ai'];
    for (const tool of toolsToCheck) {
      const toolCheck = checks.find((c: any) => c.name === `tool-${tool}`);
      expect(toolCheck).toBeDefined();
      expect(['pass', 'warn', 'info']).toContain(toolCheck.status);
    }
  });

  test('renderTemplate replaces COMPLEMENTARY_RULES placeholder', () => {
    const templateContent = 'Some rules here:\n{{COMPLEMENTARY_RULES}}\nEnd of rules.';
    const modelConfig: any = {
      target: 'claude',
      agents: {
        architect: { claude: 'opus' }
      }
    };
    
    // Test rendering when some tools are mocked/stubbed as available
    // First, let's verify renderTemplate runs without throwing
    const rendered = renderTemplate(templateContent, modelConfig, 'architect.md', 'en');
    expect(rendered).toContain('Some rules here:');
    expect(rendered).toContain('End of rules.');
    expect(rendered).not.toContain('{{COMPLEMENTARY_RULES}}');
  });

  test('applySingleFile injects MCP config for settings.json', async () => {
    const { applySingleFile } = await import('../src/core/presets/file-copier');
    const srcPath = join(TEST_DIR, 'src-settings.json');
    const destPath = join(TEST_DIR, 'settings.json');
    
    const initialConfig = JSON.stringify({
      env: {},
      mcpServers: {}
    }, null, 2);
    
    await writeFile(srcPath, initialConfig, 'utf-8');
    
    const result = await applySingleFile(
      srcPath,
      destPath,
      'overwrite',
      true, // force
      false, // dryRun
      false, // isTemplate
      null, // modelConfig
      'en'
    );
    
    expect(result.action).toBe('written');
    const writtenContent = await readFile(destPath, 'utf-8');
    const parsed = JSON.parse(writtenContent);
    
    const tools = detectComplementaryTools();
    if (tools.codeReviewGraph) {
      expect(parsed.mcpServers['code-review-graph']).toBeDefined();
    }
    if (tools.tokenSavior) {
      expect(parsed.mcpServers['token-savior-recall']).toBeDefined();
    }
  });
});
